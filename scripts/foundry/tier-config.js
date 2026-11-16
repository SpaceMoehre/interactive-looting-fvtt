/**
 * Settings menu: the global default table and the list of power tiers.
 * A tier picks a table (and optionally a DC) for creatures whose power value
 * (e.g. CR) falls within [min, max], optionally only for one creature type.
 */
import { MODULE_ID } from "../core/loot-sources.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @param {any} v @returns {number|null} */
const num = (v) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

export class TierConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-tiers`,
    tag: "form",
    classes: ["interactive-looting", "tier-config"],
    window: { title: "INTERACTIVE_LOOTING.Tiers.Title", icon: "fa-solid fa-layer-group", resizable: true },
    position: { width: 640, height: "auto" },
    form: { handler: TierConfig.#onSubmit, closeOnSubmit: true },
    actions: { addTier: TierConfig.#onAdd, removeTier: TierConfig.#onRemove },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/tier-config.hbs` },
  };

  /** @type {{tiers: any[], defaultTable: string}|null} unsaved edits kept across add/remove re-renders */
  #draft = null;

  #current() {
    return this.#draft ?? {
      tiers: foundry.utils.deepClone(game.settings.get(MODULE_ID, "tiers") ?? []),
      defaultTable: game.settings.get(MODULE_ID, "defaultTable") ?? "",
    };
  }

  /** Read the form as it currently stands. */
  #readForm() {
    const data = new foundry.applications.ux.FormDataExtended(this.element).object;
    return TierConfig.#normalize(foundry.utils.expandObject(data));
  }

  /** @param {any} data */
  static #normalize(data) {
    const tiers = Object.values(data.tiers ?? {}).map((/** @type {any} */ t) => ({
      min: num(t.min),
      max: num(t.max),
      type: String(t.type ?? "").trim(),
      table: String(t.table ?? ""),
      dc: num(t.dc),
    }));
    return { tiers, defaultTable: String(data.defaultTable ?? "") };
  }

  /** @override */
  async _prepareContext() {
    const { tiers, defaultTable } = this.#current();
    /** @type {Record<string, string>} */
    const tables = {};
    for (const t of game.tables) tables[t.uuid] = t.name;
    for (const uuid of [defaultTable, ...tiers.map((t) => t.table)]) {
      if (uuid && !tables[uuid]) tables[uuid] = /** @type {any} */ (fromUuidSync(uuid))?.name ?? uuid;
    }
    return { tiers: tiers.map((t, i) => ({ ...t, index: i })), defaultTable, tables };
  }

  /** @this {TierConfig} */
  static #onAdd() {
    const draft = this.#readForm();
    draft.tiers.push({ min: null, max: null, type: "", table: "", dc: null });
    this.#draft = draft;
    this.render();
  }

  /** @this {TierConfig} @param {Event} _ev @param {HTMLElement} target */
  static #onRemove(_ev, target) {
    const draft = this.#readForm();
    draft.tiers.splice(Number(target.dataset.index), 1);
    this.#draft = draft;
    this.render();
  }

  /** @this {TierConfig} @param {SubmitEvent} _ev @param {HTMLFormElement} _form @param {any} formData */
  static async #onSubmit(_ev, _form, formData) {
    const { tiers, defaultTable } = TierConfig.#normalize(foundry.utils.expandObject(formData.object));
    await game.settings.set(MODULE_ID, "tiers", tiers);
    await game.settings.set(MODULE_ID, "defaultTable", defaultTable);
    this.#draft = null;
  }
}
