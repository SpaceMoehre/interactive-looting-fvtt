/**
 * Adds a "Loot" tab to the Token config and the Prototype Token config.
 * Form fields are named `flags.interactive-looting.config.*` and are saved by the
 * sheet's own submit. Item drops and the GM buttons update the document directly.
 */
import { MODULE_ID } from "../core/loot-sources.js";
import * as state from "./state.js";
import * as gm from "./gm.js";

const TAB = MODULE_ID;
const TEMPLATE = `modules/${MODULE_ID}/templates/token-config.hbs`;
const L = (/** @type {string} */ k) => `INTERACTIVE_LOOTING.Config.${k}`;

const renderTemplate = (/** @type {string} */ path, /** @type {any} */ data) =>
  (foundry.applications.handlebars?.renderTemplate ?? globalThis.renderTemplate)(path, data);
const TextEditorImpl = () => foundry.applications.ux?.TextEditor?.implementation ?? globalThis.TextEditor;

/**
 * Resolve what the sheet edits: a placed token, or an actor's prototype token.
 * @param {any} app
 * @returns {{token: TokenDocument|null, actor: Actor|null}}
 */
function target(app) {
  const doc = app.document;
  if (doc?.documentName === "Token") return { token: doc, actor: doc.actor };
  const actor = app.actor ?? doc?.actor ?? (doc?.documentName === "Actor" ? doc : null) ?? app.token?.actor ?? null;
  return { token: null, actor };
}

/** @param {{token: TokenDocument|null, actor: Actor|null}} t */
function readConfig({ token, actor }) {
  if (token) return token.getFlag(MODULE_ID, "config") ?? {};
  return /** @type {any} */ (actor)?.prototypeToken?.flags?.[MODULE_ID]?.config ?? {};
}

/**
 * @param {{token: TokenDocument|null, actor: Actor|null}} t
 * @param {Record<string, any>} changes  keys relative to the config object
 */
async function writeConfig({ token, actor }, changes) {
  const prefix = `flags.${MODULE_ID}.config`;
  const update = Object.fromEntries(Object.entries(changes).map(([k, v]) => [`${prefix}.${k}`, v]));
  if (token) return token.update(update);
  if (actor) return actor.update(Object.fromEntries(Object.entries(update).map(([k, v]) => [`prototypeToken.${k}`, v])));
}

/** World and referenced tables as select choices. @param {Record<string, any>} config */
function tableChoices(config) {
  /** @type {Record<string, string>} */
  const choices = {};
  for (const t of game.tables) choices[t.uuid] = t.name;
  for (const uuid of [config.table, config.secondaryTable]) {
    if (uuid && !choices[uuid]) choices[uuid] = /** @type {any} */ (fromUuidSync(uuid))?.name ?? uuid;
  }
  return choices;
}

/** @param {any} app @param {HTMLElement} element */
export async function injectTab(app, element) {
  if (!game.user.isGM) return;
  const t = target(app);
  if (!t.token && !t.actor) return;

  const nav = element.querySelector("nav.tabs[data-group], nav.sheet-tabs");
  const firstTab = nav?.querySelector("[data-tab][data-group]");
  const group = /** @type {HTMLElement|null} */ (firstTab)?.dataset.group ?? "sheet";
  element.querySelectorAll(`[data-tab="${TAB}"]`).forEach((el) => el.remove());

  const config = readConfig(t);
  const c = t.token ? state.container(t.token) : null;
  const secondaryItems = (config.secondaryItems ?? []).map((/** @type {string} */ uuid) => {
    /** @type {any} */
    const item = fromUuidSync(uuid);
    return { uuid, name: item?.name ?? uuid, img: item?.img ?? "icons/svg/item-bag.svg" };
  });
  const resolved = t.token ? state.primaryTableUuid(t.token) : null;
  const html = await renderTemplate(TEMPLATE, {
    isPrototype: !t.token,
    hintKey: L(t.token ? "TokenHint" : "PrototypeHint"),
    config,
    tables: tableChoices(config),
    resolvedTable: resolved ? /** @type {any} */ (fromUuidSync(resolved))?.name ?? resolved : game.i18n.localize(L("None")),
    secondaryItems,
    container: c ? c.entries : null,
    lootCheckChoices: { "": L("Default"), on: L("On"), off: L("Off") },
    consequenceChoices: {
      "": L("Default"),
      silent: "INTERACTIVE_LOOTING.Settings.consequence.silent",
      noticed: "INTERACTIVE_LOOTING.Settings.consequence.noticed",
      hostile: "INTERACTIVE_LOOTING.Settings.consequence.hostile",
    },
  });

  const active = app.tabGroups?.[group] === TAB;
  const link = document.createElement("a");
  link.dataset.action = "tab";
  link.dataset.group = group;
  link.dataset.tab = TAB;
  link.innerHTML = `<i class="fa-solid fa-sack"></i> <span>${game.i18n.localize("INTERACTIVE_LOOTING.Config.TabLabel")}</span>`;
  if (active) link.classList.add("active");

  const section = document.createElement("div");
  section.classList.add("tab");
  section.dataset.group = group;
  section.dataset.tab = TAB;
  if (active) section.classList.add("active");
  section.innerHTML = html;

  const tabs = element.querySelectorAll(`.tab[data-group="${group}"]`);
  const lastTab = tabs[tabs.length - 1];
  if (nav && lastTab) {
    nav.append(link);
    lastTab.after(section);
  } else {
    // No tab layout found: append as a plain section before the footer.
    section.classList.remove("tab");
    const footer = element.querySelector("footer, .form-footer");
    (footer ? footer.before.bind(footer) : (n) => element.querySelector("form, .window-content")?.append(n))(section);
  }

  activateListeners(section, t, app);
}

/**
 * @param {HTMLElement} root
 * @param {{token: TokenDocument|null, actor: Actor|null}} t
 * @param {any} app
 */
function activateListeners(root, t, app) {
  const config = readConfig(t);

  const itemZone = root.querySelector("[data-il-item-drop]");
  itemZone?.addEventListener("dragover", (ev) => ev.preventDefault());
  itemZone?.addEventListener("drop", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const data = TextEditorImpl().getDragEventData(ev);
    if (data?.type !== "Item" || !data.uuid) return;
    const list = new Set(config.secondaryItems ?? []);
    list.add(data.uuid);
    await writeConfig(t, { secondaryItems: [...list] });
    app.render();
  });

  for (const a of root.querySelectorAll("[data-il-remove-item]")) {
    a.addEventListener("click", async () => {
      const uuid = /** @type {HTMLElement} */ (a).dataset.ilRemoveItem;
      await writeConfig(t, { secondaryItems: (config.secondaryItems ?? []).filter((/** @type {string} */ u) => u !== uuid) });
      app.render();
    });
  }

  for (const select of root.querySelectorAll("[data-il-table-drop]")) {
    select.addEventListener("dragover", (ev) => ev.preventDefault());
    select.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const data = TextEditorImpl().getDragEventData(ev);
      if (data?.type !== "RollTable" || !data.uuid) return;
      const name = /** @type {HTMLSelectElement} */ (select).name.split(".").pop();
      await writeConfig(t, { [/** @type {string} */ (name)]: data.uuid });
      app.render();
    });
  }

  const token = t.token;
  if (!token) return;
  for (const btn of root.querySelectorAll("[data-il-gm]")) {
    btn.addEventListener("click", async () => {
      const action = /** @type {HTMLElement} */ (btn).dataset.ilGm;
      if (action === "reroll") await gm.reroll(token);
      else if (action === "clear") await gm.clearLoot(token);
      else if (action === "reset") await gm.resetAccess(token);
      app.render();
    });
  }
}
