/**
 * The minimal loot window: icon, name, amount, checkbox; Take / Take all / Trash.
 * Renders straight from the token's flags, so every open window re-renders when
 * the GM updates the token (live sync between players).
 */
import { MODULE_ID } from "../core/loot-sources.js";
import { displayEntries } from "../core/loot-container.js";
import { request } from "./socket.js";
import * as state from "./state.js";
import * as settings from "./settings.js";
import { payloadFor } from "./player.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/** @param {string} error */
function warn(error) {
  ui.notifications.warn(game.i18n.localize(`INTERACTIVE_LOOTING.Error.${error}`));
}

export class LootWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @type {Map<string, LootWindow>} */
  static instances = new Map();

  static DEFAULT_OPTIONS = {
    classes: ["interactive-looting", "loot-window"],
    window: { icon: "fa-solid fa-sack", resizable: false },
    position: { width: 320, height: "auto" },
    actions: {
      take: LootWindow.#onTake,
      takeAll: LootWindow.#onTakeAll,
      trash: LootWindow.#onTrash,
    },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/loot-window.hbs` },
  };

  /**
   * @param {TokenDocument} token
   * @param {"loot"|"steal"} mode
   */
  static open(token, mode) {
    const existing = LootWindow.instances.get(token.id);
    if (existing && existing.mode === mode) return existing.render({ force: true });
    existing?.close();
    const win = new LootWindow({ token, mode });
    LootWindow.instances.set(token.id, win);
    return win.render({ force: true });
  }

  /** Called from the updateToken / deleteToken hooks. @param {TokenDocument} token @param {boolean} [deleted] */
  static refresh(token, deleted = false) {
    const win = LootWindow.instances.get(token.id);
    if (!win) return;
    if (deleted || win.shouldClose()) win.close();
    else win.render();
  }

  /** @param {{token: TokenDocument, mode: "loot"|"steal"} & Record<string, any>} options */
  constructor({ token, mode, ...options }) {
    super({ ...options, id: `${MODULE_ID}-${token.id}` });
    this.token = token;
    this.mode = mode;
    /** @type {Set<string>} */
    this.selected = new Set();
    this.busy = false;
  }

  get title() {
    const key = this.mode === "steal" ? "Window.StealTitle" : "Window.LootTitle";
    return game.i18n.format(`INTERACTIVE_LOOTING.${key}`, { name: this.token.name });
  }

  get remainingSteals() {
    return state.access(this.token).grants[game.user.id] ?? 0;
  }

  /** An empty window stays open (it shows "Nothing left"); a removed token closes it. */
  shouldClose() {
    return this.mode === "steal" && this.remainingSteals <= 0;
  }

  /** @override */
  async _prepareContext() {
    const c = state.container(this.token) ?? { entries: [] };
    const entries = displayEntries(c);
    const ids = new Set(entries.map((e) => e.id));
    for (const id of this.selected) if (!ids.has(id)) this.selected.delete(id);
    const perm = settings.get("trashPermission");
    const isLoot = this.mode === "loot";
    return {
      entries: entries.map((e) => ({
        ...e,
        checked: this.selected.has(e.id),
        amount: e.kind === "currency" ? `${e.quantity} ${e.denomination}` : `×${e.quantity}`,
        showAmount: e.kind === "currency" || e.quantity > 1,
      })),
      isLoot,
      remaining: this.remainingSteals,
      canTrash: isLoot && (perm === "everyone" || (perm === "gm" && game.user.isGM)),
      locked: this.busy || entries.length === 0,
    };
  }

  /** @override */
  async _onRender(/** @type {any} */ context, /** @type {any} */ options) {
    await super._onRender(context, options);
    for (const box of this.element.querySelectorAll("input[type=checkbox][data-entry]")) {
      box.addEventListener("change", (ev) => {
        const input = /** @type {HTMLInputElement} */ (ev.currentTarget);
        if (input.checked) this.selected.add(input.dataset.entry);
        else this.selected.delete(input.dataset.entry);
        this.#limitSelection();
      });
    }
    this.#limitSelection();
  }

  /** In steal mode, disable further checkboxes once the allowed number is selected. */
  #limitSelection() {
    if (this.mode !== "steal") return;
    const full = this.selected.size >= this.remainingSteals;
    for (const box of this.element.querySelectorAll("input[type=checkbox][data-entry]")) {
      const input = /** @type {HTMLInputElement} */ (box);
      input.disabled = full && !input.checked;
    }
  }

  /** @param {string} action @param {Record<string, any>} [extra] */
  async #send(action, extra = {}) {
    if (this.busy) return;
    this.busy = true;
    try {
      const res = await request(action, { ...payloadFor(this.token), mode: this.mode, ...extra });
      if (!res.ok) warn(res.error);
      else this.selected.clear();
    } finally {
      this.busy = false;
      if (this.rendered) this.shouldClose() ? this.close() : this.render();
    }
  }

  /** @this {LootWindow} */
  static async #onTake() {
    if (!this.selected.size) return warn("nothingSelected");
    await this.#send("take", { ids: [...this.selected] });
  }

  /** @this {LootWindow} */
  static async #onTakeAll() {
    await this.#send("take", { ids: "all" });
  }

  /** @this {LootWindow} */
  static async #onTrash() {
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("INTERACTIVE_LOOTING.Window.TrashTitle") },
      content: `<p>${game.i18n.format("INTERACTIVE_LOOTING.Window.TrashConfirm", { name: this.token.name })}</p>`,
      rejectClose: false,
    });
    if (confirmed) await this.#send("trash");
  }

  /** @override */
  _onClose(/** @type {any} */ options) {
    super._onClose(options);
    if (LootWindow.instances.get(this.token.id) === this) LootWindow.instances.delete(this.token.id);
  }
}
