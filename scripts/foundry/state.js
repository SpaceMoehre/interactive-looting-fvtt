/**
 * Reads and writes the module's data on tokens, and evaluates a target token.
 * Flags live at `flags.interactive-looting`:
 *   config     – per-token overrides (also on the actor's prototype token = actor override)
 *   container  – frozen LootContainer, or absent until first rolled
 *   access     – AccessState (locks, searched users, steal grants)
 */
import { MODULE_ID, specialItems, currencyFromResult, mergeDrafts } from "../core/loot-sources.js";
import { resolveTable, matchTier } from "../core/table-resolution.js";
import { isDead, interactionMode } from "../core/targeting.js";
import { emptyAccess } from "../core/access.js";
import { reconcile } from "../core/loot-container.js";
import * as settings from "./settings.js";
import * as system from "./system.js";

/**
 * @typedef {object} TokenLootConfig
 * @property {string} [table]
 * @property {string} [secondaryTable]
 * @property {string[]} [secondaryItems]
 * @property {""|"on"|"off"} [lootCheck]
 * @property {number|null} [lootDc]
 * @property {number|null} [stealDc]
 * @property {""|"silent"|"noticed"|"hostile"} [consequence]
 */

/** @param {any} v @returns {number|null} */
const num = (v) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * Token config merged over the actor's prototype config (actor override).
 * @param {TokenDocument} token
 * @returns {{token: TokenLootConfig, actor: TokenLootConfig, merged: Required<TokenLootConfig>}}
 */
export function lootConfig(token) {
  /** @type {TokenLootConfig} */
  const t = token.getFlag(MODULE_ID, "config") ?? {};
  /** @type {TokenLootConfig} */
  const a = /** @type {any} */ (token.actor)?.prototypeToken?.flags?.[MODULE_ID]?.config ?? {};
  const pick = (/** @type {keyof TokenLootConfig} */ k) => (t[k] !== undefined && t[k] !== "" && t[k] !== null ? t[k] : a[k]);
  const items = t.secondaryItems?.length ? t.secondaryItems : a.secondaryItems;
  return {
    token: t,
    actor: a,
    merged: {
      table: /** @type {string} */ (pick("table") || ""),
      secondaryTable: /** @type {string} */ (pick("secondaryTable") || ""),
      secondaryItems: Array.isArray(items) ? items : [],
      lootCheck: /** @type {any} */ (pick("lootCheck") || ""),
      lootDc: num(pick("lootDc")),
      stealDc: num(pick("stealDc")),
      consequence: /** @type {any} */ (pick("consequence") || ""),
    },
  };
}

/** @param {TokenDocument} token @returns {import("../core/loot-container.js").LootContainer|null} */
export function container(token) {
  return token.getFlag(MODULE_ID, "container") ?? null;
}

/** @param {TokenDocument} token @returns {import("../core/access.js").AccessState} */
export function access(token) {
  return { ...emptyAccess(), ...(token.getFlag(MODULE_ID, "access") ?? {}) };
}

/** @param {TokenDocument} token */
export function tierFor(token) {
  const actor = token.actor;
  if (!actor) return null;
  return matchTier(settings.get("tiers"), system.power(actor), system.creatureType(actor));
}

/** @param {TokenDocument} token */
export function primaryTableUuid(token) {
  const actor = token.actor;
  if (!actor) return null;
  const { token: t, actor: a } = lootConfig(token);
  return resolveTable({
    tokenTable: t.table,
    actorTable: a.table,
    tiers: settings.get("tiers"),
    defaultTable: settings.get("defaultTable"),
    power: system.power(actor),
    creatureType: system.creatureType(actor),
  });
}

/** Items on the token's actor that are special (quest) loot. @param {TokenDocument} token */
export function specialActorItems(token) {
  const actor = token.actor;
  if (!actor) return [];
  /** @type {any} */
  const base = token.actorLink ? null : /** @type {any} */ (token).baseActor;
  const baseIds = base ? base.items.map((/** @type {any} */ i) => i.id) : null;
  return specialItems(actor.items.contents, baseIds);
}

/** @param {TokenDocument} token */
export function hasLoot(token) {
  const c = container(token);
  if (c) return c.entries.length > 0;
  const cfg = lootConfig(token).merged;
  return Boolean(primaryTableUuid(token) || cfg.secondaryTable || cfg.secondaryItems.length || specialActorItems(token).length);
}

/** @param {TokenDocument} token */
export function tokenIsDead(token) {
  const actor = token.actor;
  if (!actor) return false;
  const defeated = CONFIG.specialStatusEffects.DEFEATED ?? "dead";
  /** @type {Set<string>} */
  const statuses = actor.statuses ?? new Set();
  return isDead(
    { statuses: statuses.has(defeated) || token.hasStatusEffect?.(defeated) ? ["dead"] : [], hp: system.hp(actor) },
    { useDeadStatus: settings.get("useDeadStatus"), useZeroHp: settings.get("useZeroHp") },
  );
}

/**
 * Edge-to-edge distance in scene units between two tokens (approximate for large tokens).
 * @param {TokenDocument} a
 * @param {TokenDocument} b
 */
export function tokenDistance(a, b) {
  // Use document data and the scene's own grid, not the canvas: the GM validating
  // the request may be viewing a different scene.
  /** @type {any} */
  const grid = a.parent?.grid;
  if (!grid || a.parent !== b.parent) return null;
  const center = (/** @type {TokenDocument} */ t) => ({
    x: t.x + (t.width * grid.size) / 2,
    y: t.y + (t.height * grid.size) / 2,
  });
  const centre = grid.measurePath([center(a), center(b)]).distance;
  const size = (/** @type {TokenDocument} */ t) => Math.max(t.width, t.height) - 1;
  return Math.max(0, centre - ((size(a) + size(b)) / 2) * grid.distance);
}

/**
 * @param {TokenDocument} target
 * @param {TokenDocument|null} own  the player's token
 */
export function evaluate(target, own, { ignoreRange = false } = {}) {
  const actor = target.actor;
  if (!actor) return /** @type {const} */ ({ mode: null, reason: "noLoot" });
  const max = Number(settings.get("maxDistance"));
  const sameScene = Boolean(own && own.parent === target.parent);
  return interactionMode({
    isPlayerCharacter: system.isPlayerCharacter(actor),
    dead: tokenIsDead(target),
    distance: !ignoreRange && sameScene && own ? tokenDistance(own, target) : null,
    maxDistance: !ignoreRange && max > 0 ? max : null,
    hasOwnToken: ignoreRange || sameScene,
  });
}

/* -------------------------------------------- */
/*  Rolling                                     */
/* -------------------------------------------- */

/**
 * @param {string} uuid
 * @param {boolean} quest
 * @returns {Promise<import("../core/loot-sources.js").LootDraft[]>}
 */
async function drawTable(uuid, quest) {
  /** @type {any} */
  const table = await fromUuid(uuid);
  if (!table || table.documentName !== "RollTable") return [];
  const draw = await table.roll({ recursive: true });
  /** @type {import("../core/loot-sources.js").LootDraft[]} */
  const drafts = [];
  for (const r of draw?.results ?? []) {
    if (r.documentUuid) {
      const draft = await itemDraft(r.documentUuid, quest);
      if (draft) drafts.push(draft);
      continue;
    }
    const money = currencyFromResult(r, settings.denominations());
    if (!money) continue;
    let amount = 0;
    try {
      amount = Math.floor((await new Roll(money.formula).evaluate()).total);
    } catch (err) {
      console.warn(`${MODULE_ID} | bad currency formula "${money.formula}" in table ${uuid}`, err);
    }
    if (amount > 0) drafts.push(currencyDraft(money.denomination, amount, quest));
  }
  return drafts;
}

/** @param {string} denomination @param {number} amount @param {boolean} quest */
function currencyDraft(denomination, amount, quest) {
  return {
    key: `currency:${denomination}`,
    kind: /** @type {const} */ ("currency"),
    name: denomination,
    img: "icons/commodities/currency/coins-plain-stack-gold.webp",
    quantity: amount,
    quest,
    denomination,
  };
}

/**
 * @param {string} uuid
 * @param {boolean} quest
 * @returns {Promise<import("../core/loot-sources.js").LootDraft|null>}
 */
async function itemDraft(uuid, quest) {
  /** @type {any} */
  const doc = await fromUuid(uuid);
  if (!doc || doc.documentName !== "Item") return null;
  const itemData = doc.toObject();
  delete itemData._id;
  itemData._stats = { ...(itemData._stats ?? {}), compendiumSource: itemData._stats?.compendiumSource ?? doc.uuid };
  const { name, tooltip } = system.displayInfo(itemData);
  return { key: uuid, kind: "item", name, img: itemData.img, quantity: system.quantityOf(itemData), quest, itemData, tooltip };
}

/** @param {any} item */
function ownItemDraft(item) {
  const itemData = item.toObject();
  delete itemData._id;
  // The "loot" marker is GM bookkeeping; don't let it follow the item to the player.
  if (itemData.flags?.[MODULE_ID]) delete itemData.flags[MODULE_ID].loot;
  const { name, tooltip } = system.displayInfo(itemData);
  return {
    key: `own:${item.id}`,
    kind: /** @type {const} */ ("item"),
    name,
    img: itemData.img,
    quantity: system.quantityOf(itemData),
    quest: true,
    itemData,
    tooltip,
    sourceItemId: item.id,
  };
}

/**
 * Roll all loot sources for a token and return the container (does not save it).
 * @param {TokenDocument} token
 * @returns {Promise<import("../core/loot-container.js").LootContainer>}
 */
export async function rollContainer(token) {
  const cfg = lootConfig(token).merged;
  const drafts = [];
  const primary = primaryTableUuid(token);
  if (primary) drafts.push(...(await drawTable(primary, false)));
  if (cfg.secondaryTable) drafts.push(...(await drawTable(cfg.secondaryTable, true)));
  drafts.push(...(await questItemDrafts(cfg.secondaryItems)));
  drafts.push(...specialActorItems(token).map(ownItemDraft));
  return { entries: mergeDrafts(drafts), questSources: cfg.secondaryItems.slice() };
}

/** @param {string[]} uuids */
async function questItemDrafts(uuids) {
  const drafts = [];
  for (const uuid of uuids) {
    const d = await itemDraft(uuid, true);
    if (d) drafts.push({ ...d, sourceUuid: uuid });
  }
  return drafts;
}

/**
 * Add items the GM gave the token (inventory or Loot tab) after the loot was
 * rolled, and drop ones the GM removed. GM only. Returns the current container.
 * @param {TokenDocument} token
 */
export async function syncContainer(token) {
  const c = container(token);
  if (!c) return null;
  const own = specialActorItems(token);
  const r = reconcile(c, { ownItemIds: own.map((i) => i.id), questUuids: lootConfig(token).merged.secondaryItems });
  const added = [
    ...own.filter((i) => r.addOwn.includes(i.id)).map(ownItemDraft),
    ...(await questItemDrafts(r.addUuids)),
  ];
  const next = { ...r.container, entries: [...r.container.entries, ...mergeDrafts(added)] };
  if (JSON.stringify(next) === JSON.stringify(c)) return c;
  await token.setFlag(MODULE_ID, "container", next);
  return next;
}
