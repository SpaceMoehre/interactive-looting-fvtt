export const MODULE_ID = "interactive-looting";

/**
 * Items on a token that count as special loot: items not present on the base actor
 * (unlinked tokens), plus any item explicitly flagged as loot.
 * @template {{_id: string, flags?: Record<string, any>}} T
 * @param {T[]} tokenItems
 * @param {Iterable<string>|null} baseItemIds  null for linked tokens (no base to diff against)
 * @returns {T[]}
 */
export function specialItems(tokenItems, baseItemIds) {
  const base = baseItemIds ? new Set(baseItemIds) : null;
  return tokenItems.filter((i) => i.flags?.[MODULE_ID]?.loot === true || (base !== null && !base.has(i._id)));
}

/**
 * Recognise a table text result describing money, e.g. "2d6 gp", "[[3d10*5]] sp".
 * @param {string} text  may contain HTML
 * @param {string[]} denominations  known currency keys of the system
 * @returns {{formula: string, denomination: string} | null}
 */
export function parseCurrencyText(text, denominations) {
  const plain = text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;| /gi, " ")
    .trim();
  const m = /^(?:\[\[\s*(?:\/r(?:oll)?\s+)?(.+?)\s*\]\]|([0-9d+\-*/() ]+?))\s*([a-z]+)\.?$/i.exec(plain);
  if (!m) return null;
  const denomination = m[3].toLowerCase();
  if (!denominations.includes(denomination)) return null;
  const formula = (m[1] ?? m[2]).trim();
  if (!formula) return null;
  return { formula, denomination };
}

/**
 * Currency described by a table text result. Checks the name, then the
 * description, so "Gold" + "2d6 gp" works as well as a name of "2d6 gp".
 * @param {{name?: string|null, description?: string|null}} result
 * @param {string[]} denominations
 */
export function currencyFromResult(result, denominations) {
  for (const text of [result.name, result.description]) {
    if (typeof text !== "string" || !text.trim()) continue;
    const money = parseCurrencyText(text, denominations);
    if (money) return money;
  }
  return null;
}

/**
 * A loot entry before it gets an id. `key` identifies what is "the same thing"
 * for stacking: an item's source UUID or a currency denomination.
 * @typedef {Omit<import("./loot-container.js").LootEntry, "id"> & {key: string}} LootDraft
 */

/** @returns {string} */
export function randomId() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < 16; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/**
 * Merge drafts with the same key and quest-ness into one stack and assign ids.
 * @param {LootDraft[]} drafts
 * @returns {import("./loot-container.js").LootEntry[]}
 */
export function mergeDrafts(drafts) {
  /** @type {Map<string, import("./loot-container.js").LootEntry>} */
  const byKey = new Map();
  for (const { key, ...draft } of drafts) {
    const k = `${draft.quest ? "q" : "n"}:${key}`;
    const existing = byKey.get(k);
    if (existing) existing.quantity += draft.quantity;
    else byKey.set(k, { ...draft, id: randomId() });
  }
  return [...byKey.values()];
}
