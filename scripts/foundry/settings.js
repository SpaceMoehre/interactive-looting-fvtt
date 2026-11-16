import { MODULE_ID } from "../core/loot-sources.js";
import { TierConfig } from "./tier-config.js";
import { HelpWindow } from "./help.js";

/** System presets for data paths and skill keys. Anything missing falls back to GENERIC. */
const PRESETS = {
  dnd5e: {
    powerPath: "system.details.cr",
    typePath: "system.details.type.value",
    hpPath: "system.attributes.hp.value",
    passivePath: "system.skills.prc.passive",
    lootSkill: "inv",
    stealSkill: "slt",
    skillModPath: "system.skills.{skill}.total",
    currencyPath: "system.currency",
    denominations: "pp,gp,ep,sp,cp",
    quantityPath: "system.quantity",
  },
};

const GENERIC = {
  powerPath: "",
  typePath: "",
  hpPath: "",
  passivePath: "",
  lootSkill: "",
  stealSkill: "",
  skillModPath: "",
  currencyPath: "",
  denominations: "",
  quantityPath: "system.quantity",
};

/** @param {string} key */
export function get(key) {
  return game.settings.get(MODULE_ID, key);
}

/** @param {string} key @param {any} value */
export function set(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}

const L = (/** @type {string} */ k) => `INTERACTIVE_LOOTING.Settings.${k}`;

export function registerSettings() {
  const preset = { ...GENERIC, ...(PRESETS[/** @type {keyof PRESETS} */ (game.system.id)] ?? {}) };

  /**
   * @param {string} key
   * @param {any} type
   * @param {any} def
   * @param {Record<string, any>} [extra]
   */
  const reg = (key, type, def, extra = {}) =>
    game.settings.register(MODULE_ID, key, {
      name: L(`${key}.Name`),
      hint: L(`${key}.Hint`),
      scope: "world",
      config: true,
      type,
      default: def,
      ...extra,
    });

  game.settings.registerMenu(MODULE_ID, "helpMenu", {
    name: L("helpMenu.Name"),
    label: L("helpMenu.Label"),
    hint: L("helpMenu.Hint"),
    icon: "fa-solid fa-book-open",
    type: HelpWindow,
    restricted: false,
  });
  game.settings.registerMenu(MODULE_ID, "tierMenu", {
    name: L("tierMenu.Name"),
    label: L("tierMenu.Label"),
    hint: L("tierMenu.Hint"),
    icon: "fa-solid fa-layer-group",
    type: TierConfig,
    restricted: true,
  });
  game.settings.register(MODULE_ID, "tiers", { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(MODULE_ID, "defaultTable", { scope: "world", config: false, type: String, default: "" });

  // Interaction
  reg("maxDistance", Number, 5);
  reg("doubleClick", Boolean, true, { requiresReload: true });
  reg("useDeadStatus", Boolean, true);
  reg("useZeroHp", Boolean, true);

  // Loot check
  reg("lootCheckEnabled", Boolean, false);
  reg("lootCheckDc", Number, 10);
  reg("lootRetry", Boolean, false);

  // Steal
  reg("stealDefaultDc", Number, 10);
  reg("stealLimit", Number, 1);
  reg("consequence", String, "noticed", {
    choices: {
      silent: L("consequence.silent"),
      noticed: L("consequence.noticed"),
      hostile: L("consequence.hostile"),
    },
  });
  reg("retryLock", Boolean, true);
  reg("marginEscalation", Boolean, false);
  reg("combatPrompt", Boolean, true);

  // Trash & cleanup
  reg("trashPermission", String, "everyone", {
    choices: { everyone: L("trashPermission.everyone"), gm: L("trashPermission.gm"), off: L("trashPermission.off") },
  });
  reg("trashQuest", Boolean, false);
  reg("removeEmpty", String, "delete", {
    choices: { delete: L("removeEmpty.delete"), keep: L("removeEmpty.keep") },
  });

  // System data paths (prefilled from the system preset)
  for (const [key, def] of Object.entries(preset)) reg(key, String, def);
}

/** Fix values saved by 0.1.0, which shipped the wrong dnd5e Sleight of Hand key. GM only. */
export async function migrate() {
  if (!game.user.isGM || game.system.id !== "dnd5e") return;
  if (get("stealSkill") === "slh") await set("stealSkill", "slt");
}

/** @returns {string[]} */
export function denominations() {
  return String(get("denominations"))
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}
