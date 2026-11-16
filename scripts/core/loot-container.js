/**
 * The frozen loot of one token. Stored in the token's module flags; this file
 * only contains pure operations on it.
 *
 * @typedef {object} LootEntry
 * @property {string} id
 * @property {"item"|"currency"} kind
 * @property {string} name
 * @property {string} img
 * @property {number} quantity
 * @property {boolean} quest              guaranteed reward from the secondary source
 * @property {string} [denomination]      currency only, e.g. "gp"
 * @property {Record<string, any>} [itemData]  item only, full item source to create on the taker
 * @property {string} [tooltip]           optional plain-text description for the hover tooltip
 * @property {string} [sourceItemId]      item on the token's actor this entry was taken from (moved on take)
 *
 * @typedef {object} LootContainer
 * @property {LootEntry[]} entries
 *
 * @typedef {"loot"|"steal"} Mode
 * @typedef {{ok: true, container: LootContainer, taken: LootEntry[]} | {ok: false, error: string}} TakeResult
 */

/**
 * Take selected entries. Entries that are already gone are skipped (first click wins).
 * @param {LootContainer} container
 * @param {string[]} ids
 * @param {{mode: Mode, stealLimit: number}} opts
 * @returns {TakeResult}
 */
export function take(container, ids, { mode, stealLimit }) {
  if (!ids.length) return { ok: false, error: "nothingSelected" };
  if (mode === "steal" && ids.length > stealLimit) return { ok: false, error: "stealLimit" };
  const wanted = new Set(ids);
  const taken = container.entries.filter((e) => wanted.has(e.id));
  if (!taken.length) return { ok: false, error: "alreadyTaken" };
  return {
    ok: true,
    taken,
    container: { ...container, entries: container.entries.filter((e) => !wanted.has(e.id)) },
  };
}

/**
 * @param {LootContainer} container
 * @param {{mode: Mode}} opts
 * @returns {TakeResult}
 */
export function takeAll(container, { mode }) {
  if (mode === "steal") return { ok: false, error: "notAllowedWhileStealing" };
  if (!container.entries.length) return { ok: false, error: "alreadyTaken" };
  return { ok: true, taken: container.entries, container: { ...container, entries: [] } };
}

/**
 * Destroy remaining loot.
 * @param {LootContainer} container
 * @param {{protectQuest: boolean}} opts
 * @returns {{container: LootContainer, removed: LootEntry[]}}
 */
export function trash(container, { protectQuest }) {
  const keep = (/** @type {LootEntry} */ e) => protectQuest && e.quest;
  return {
    removed: container.entries.filter((e) => !keep(e)),
    container: { ...container, entries: container.entries.filter(keep) },
  };
}

/** @param {LootContainer} container */
export function isEmpty(container) {
  return container.entries.length === 0;
}

/**
 * Entries as players see them: sorted by name, without the quest marker or item data.
 * @param {LootContainer} container
 */
export function displayEntries(container) {
  return container.entries
    .map(({ id, kind, name, img, quantity, denomination, tooltip }) => ({
      id,
      kind,
      name,
      img,
      quantity,
      denomination,
      tooltip,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
