/**
 * Client-side flow: target token → ask GM → roll own skill → open the loot window.
 */
import { MODULE_ID } from "../core/loot-sources.js";
import { request } from "./socket.js";
import * as system from "./system.js";
import * as settings from "./settings.js";
import { LootWindow } from "./loot-window.js";
import { ownToken, payloadFor } from "./player.js";

/** Errors the player should not be told about (token simply does nothing). */
const SILENT = new Set(["noLoot", "playerCharacter"]);

/** @param {string} error */
export function notifyError(error) {
  if (SILENT.has(error)) return;
  ui.notifications.warn(game.i18n.localize(`INTERACTIVE_LOOTING.Error.${error}`));
}

/** @type {Set<string>} */
const busy = new Set();

/**
 * Start a loot or steal attempt on a token.
 * @param {TokenDocument} target
 */
export async function startInteraction(target) {
  if (busy.has(target.id)) return;
  busy.add(target.id);
  try {
    const base = payloadFor(target);
    const prep = await request("prepare", base);
    if (!prep.ok) return notifyError(prep.error);

    if (prep.granted) return LootWindow.open(target, prep.mode);

    let total = null;
    if (prep.needsRoll) {
      const own = ownToken(target);
      const actor = own?.actor ?? game.user.character;
      if (!actor) return notifyError("noActor");
      if (!prep.skill) return notifyError("noSkill");
      if (!system.hasSkill(actor, prep.skill)) {
        return ui.notifications.error(game.i18n.format("INTERACTIVE_LOOTING.Error.unknownSkill", { skill: prep.skill }));
      }
      total = await system.rollSkill(actor, prep.skill);
      if (total === null) return; // roll dialog cancelled
    }

    const res = await request("attempt", { ...base, mode: prep.mode, total });
    if (!res.ok) return notifyError(res.error);
    if (!res.success) {
      const key = prep.mode === "loot" ? "LootFailed" : res.noticed ? "StealNoticed" : "StealFailed";
      return ui.notifications.info(game.i18n.localize(`INTERACTIVE_LOOTING.Notify.${key}`));
    }
    if (res.empty) return ui.notifications.info(game.i18n.localize("INTERACTIVE_LOOTING.Notify.Empty"));
    LootWindow.open(target, prep.mode);
  } finally {
    busy.delete(target.id);
  }
}

export function registerKeybinding() {
  game.keybindings.register(MODULE_ID, "lootTarget", {
    name: "INTERACTIVE_LOOTING.Keybinding.Name",
    hint: "INTERACTIVE_LOOTING.Keybinding.Hint",
    editable: [{ key: "KeyL" }],
    onDown: () => {
      const target = game.user.targets.first();
      if (!target) {
        ui.notifications.warn(game.i18n.localize("INTERACTIVE_LOOTING.Error.noTarget"));
        return true;
      }
      startInteraction(target.document);
      return true;
    },
  });
}

/**
 * Let players double-click non-owned NPC tokens. Core requires at least Limited
 * permission for double-click; we allow it for non-player-character tokens and
 * route the click into the loot flow. Owners keep the default behaviour.
 */
export function patchDoubleClick() {
  if (!settings.get("doubleClick")) return;
  /** @type {any} */
  const proto = CONFIG.Token.objectClass?.prototype;
  if (!proto || typeof proto._canView !== "function" || typeof proto._onClickLeft2 !== "function") {
    console.warn(`${MODULE_ID} | Token double-click patch unavailable; use the keybinding.`);
    return;
  }
  /** @param {any} token */
  const candidate = (token) =>
    !token.document.isOwner && token.actor && !system.isPlayerCharacter(token.actor);

  const canView = proto._canView;
  proto._canView = function (/** @type {any[]} */ ...args) {
    return canView.apply(this, args) || candidate(this);
  };
  const clickLeft2 = proto._onClickLeft2;
  proto._onClickLeft2 = function (/** @type {any[]} */ ...args) {
    if (candidate(this)) return void startInteraction(this.document);
    return clickLeft2.apply(this, args);
  };
}

/**
 * Token HUD button (the HUD only opens for owners and the GM).
 * @param {any} hud
 * @param {HTMLElement} html
 */
export function addHudButton(hud, html) {
  const token = hud.object?.document;
  if (!token?.actor || system.isPlayerCharacter(token.actor)) return;
  const col = html.querySelector(".col.right");
  if (!col) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.classList.add("control-icon");
  btn.dataset.tooltip = game.i18n.localize("INTERACTIVE_LOOTING.Hud");
  btn.innerHTML = `<i class="fa-solid fa-sack"></i>`;
  btn.addEventListener("click", () => startInteraction(token));
  col.append(btn);
}
