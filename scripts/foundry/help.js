/**
 * In-game documentation, opened from the module settings ("Help" button).
 * The prose lives in templates/help.hbs; the settings list and the current
 * keybinding are read live, so they always match this world.
 */
import { MODULE_ID } from "../core/loot-sources.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SECTIONS = ["overview", "players", "setup", "tables", "token", "settings", "systems", "troubleshooting"];

/** "KeyL" + ["Shift"] → "Shift + L" @param {{key: string, modifiers?: string[]}} b */
function formatBinding(b) {
  const key = b.key.replace(/^Key/, "").replace(/^Digit/, "");
  return [...(b.modifiers ?? []), key].join(" + ");
}

/** @param {any} setting @param {any} value */
function formatValue(setting, value) {
  if (setting.choices) return game.i18n.localize(setting.choices[value] ?? String(value));
  if (setting.type === Boolean) return game.i18n.localize(value ? "INTERACTIVE_LOOTING.Help.On" : "INTERACTIVE_LOOTING.Help.Off");
  if (value === "" || value === null || value === undefined) return "—";
  return String(value);
}

export class HelpWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-help`,
    classes: ["interactive-looting", "il-help"],
    window: { title: "INTERACTIVE_LOOTING.Help.Title", icon: "fa-solid fa-book-open", resizable: true },
    position: { width: 760, height: 620 },
    actions: { section: HelpWindow.#onSection },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/help.hbs` },
  };

  /** @type {string} */
  #section = "overview";

  /** @override */
  async _prepareContext() {
    const bindings = game.keybindings.get(MODULE_ID, "lootTarget") ?? [];
    const settings = [...game.settings.settings.values()]
      .filter((s) => s.namespace === MODULE_ID && s.config)
      .map((s) => ({
        name: game.i18n.localize(s.name),
        hint: game.i18n.localize(s.hint),
        value: formatValue(s, game.settings.get(MODULE_ID, s.key)),
      }));
    return {
      sections: SECTIONS.map((id) => ({ id, label: game.i18n.localize(`INTERACTIVE_LOOTING.Help.Sections.${id}`) })),
      key: bindings.length ? bindings.map(formatBinding).join(", ") : game.i18n.localize("INTERACTIVE_LOOTING.Help.Unbound"),
      settings,
      isGM: game.user.isGM,
      version: game.modules.get(MODULE_ID)?.version ?? "?",
      system: game.system.title,
      isDnd5e: game.system.id === "dnd5e",
    };
  }

  /** @override */
  async _onRender(/** @type {any} */ context, /** @type {any} */ options) {
    await super._onRender(context, options);
    this.#show(this.#section);
  }

  /** @param {string} id */
  #show(id) {
    this.#section = id;
    for (const el of this.element.querySelectorAll("[data-section]")) {
      el.classList.toggle("active", /** @type {HTMLElement} */ (el).dataset.section === id);
    }
  }

  /** @this {HelpWindow} @param {PointerEvent} _event @param {HTMLElement} target */
  static #onSection(_event, target) {
    const id = target.dataset.section;
    if (!id) return;
    this.#show(id);
    this.element.querySelector(".il-help-content")?.scrollTo({ top: 0 });
  }
}
