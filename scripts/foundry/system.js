/**
 * System adapter: everything that depends on the game system's data model.
 * dnd5e is handled explicitly; other systems go through the configurable paths.
 */
import * as settings from "./settings.js";

const { getProperty, deepClone } = foundry.utils;

/** @param {any} doc @param {string} settingKey */
function readPath(doc, settingKey) {
  const path = settings.get(settingKey);
  return path ? getProperty(doc, path) : undefined;
}

/** @param {any} v @returns {number|null} */
function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) {
    if (v.includes("/")) {
      const [a, b] = v.split("/").map(Number);
      return b ? a / b : null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** @param {Actor} actor */
export const power = (actor) => toNumber(readPath(actor, "powerPath"));
/** @param {Actor} actor */
export const creatureType = (actor) => {
  const v = readPath(actor, "typePath");
  return typeof v === "string" && v ? v : null;
};
/** @param {Actor} actor */
export const hp = (actor) => toNumber(readPath(actor, "hpPath"));
/** @param {Actor} actor */
export const passivePerception = (actor) => toNumber(readPath(actor, "passivePath"));

/** @param {Actor} actor */
export function isPlayerCharacter(actor) {
  return actor.hasPlayerOwner || actor.type === "character";
}

/**
 * Roll a skill check on the player's own client, so the system's dialogs,
 * bonuses and other modules' hooks apply. Returns the total or null if cancelled.
 * @param {Actor} actor
 * @param {string} skill
 * @returns {Promise<number|null>}
 */
export async function rollSkill(actor, skill) {
  /** @type {any} */
  const a = actor;
  let result;
  if (game.system.id === "dnd5e") {
    result = await a.rollSkill({ skill });
  } else if (typeof a.skills?.[skill]?.roll === "function") {
    result = await a.skills[skill].roll({});
  } else if (typeof a.rollSkill === "function") {
    result = await a.rollSkill(skill);
  } else {
    const modPath = String(settings.get("skillModPath") || "").replace("{skill}", skill);
    const mod = toNumber(modPath ? getProperty(actor, modPath) : 0) ?? 0;
    const roll = await new Roll("1d20 + @mod", { mod }).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: skill });
    result = roll;
  }
  if (Array.isArray(result)) result = result[0];
  const total = result?.total ?? result?.roll?.total;
  return typeof total === "number" ? total : null;
}

/** @param {string} html */
export function plainText(html, max = 300) {
  const text = String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Name and tooltip as the players should see them (respects dnd5e identification).
 * @param {Record<string, any>} itemData
 */
export function displayInfo(itemData) {
  const sys = itemData.system ?? {};
  if (game.system.id === "dnd5e" && sys.identified === false) {
    return {
      name: sys.unidentified?.name || game.i18n.localize("INTERACTIVE_LOOTING.Unidentified"),
      tooltip: plainText(sys.unidentified?.description ?? ""),
    };
  }
  return { name: itemData.name, tooltip: plainText(sys.description?.value ?? sys.description ?? "") };
}

/** @param {Record<string, any>} data */
export function quantityOf(data) {
  const q = getProperty(data, settings.get("quantityPath"));
  return typeof q === "number" && q > 0 ? q : 1;
}

/**
 * Give an item to an actor, stacking onto a matching item when one exists.
 * @param {Actor} actor
 * @param {Record<string, any>} itemData
 * @param {number} quantity
 */
export async function giveItem(actor, itemData, quantity) {
  const qPath = settings.get("quantityPath");
  const data = deepClone(itemData);
  delete data._id;
  const source = data._stats?.compendiumSource ?? null;
  /** @type {any} */
  const existing = actor.items.find((/** @type {any} */ i) => {
    if (i.type !== data.type || i.name !== data.name) return false;
    if (typeof getProperty(i, qPath) !== "number") return false;
    return (i._stats?.compendiumSource ?? null) === source;
  });
  if (existing) {
    await existing.update({ [qPath]: getProperty(existing, qPath) + quantity });
    return;
  }
  if (qPath && getProperty(data, qPath) !== undefined) foundry.utils.setProperty(data, qPath, quantity);
  await actor.createEmbeddedDocuments("Item", [data]);
}

/**
 * @param {Actor} actor
 * @param {string} denomination
 * @param {number} amount
 */
export async function giveCurrency(actor, denomination, amount) {
  const base = settings.get("currencyPath");
  if (!base) return;
  const path = `${base}.${denomination}`;
  const current = toNumber(getProperty(actor, path)) ?? 0;
  await actor.update({ [path]: current + amount });
}
