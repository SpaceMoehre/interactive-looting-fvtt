/**
 * GM-side request handlers. Every player action is validated and applied here.
 * Players roll their own skill checks; the GM trusts the reported total but
 * re-checks target eligibility, range, locks and grants.
 */
import { MODULE_ID } from "../core/loot-sources.js";
import { take, takeAll, trash, isEmpty } from "../core/loot-container.js";
import { lootCheckDc, stealCheckDc, failureConsequence } from "../core/checks.js";
import { recordAttempt, attemptBlock, takeBlock, consumeTake } from "../core/access.js";
import * as settings from "./settings.js";
import * as state from "./state.js";
import * as system from "./system.js";

const REMOVE_DELAY_MS = 2000;

/**
 * @typedef {object} TargetPayload
 * @property {string} sceneId
 * @property {string} tokenId
 * @property {string|null} ownTokenId
 */

/** @param {string} key @param {Record<string, any>} [data] */
const t = (key, data) => game.i18n.format(`INTERACTIVE_LOOTING.${key}`, data ?? {});

/** @param {string} userId @param {TargetPayload} p */
function context(userId, p) {
  const user = game.users.get(userId);
  const scene = game.scenes.get(p.sceneId);
  /** @type {TokenDocument|undefined} */
  const target = scene?.tokens.get(p.tokenId);
  if (!user || !scene || !target) return null;
  /** @type {TokenDocument|null} */
  let own = p.ownTokenId ? scene.tokens.get(p.ownTokenId) ?? null : null;
  if (own && !own.actor?.testUserPermission(user, "OWNER")) own = null;
  const actor = own?.actor ?? user.character ?? null;
  return { user, scene, target, own, actor };
}

/** @param {TokenDocument} target */
function lootDc(target) {
  const cfg = state.lootConfig(target).merged;
  const enabled = cfg.lootCheck === "on" || (cfg.lootCheck !== "off" && settings.get("lootCheckEnabled"));
  return lootCheckDc({
    enabled,
    fixedDc: cfg.lootDc,
    tierDc: state.tierFor(target)?.dc ?? null,
    defaultDc: Number(settings.get("lootCheckDc")),
  });
}

/** @param {TokenDocument} target */
function stealDc(target) {
  return stealCheckDc({
    fixedDc: state.lootConfig(target).merged.stealDc,
    passive: target.actor ? system.passivePerception(target.actor) : null,
    defaultDc: Number(settings.get("stealDefaultDc")),
  });
}

/** @param {"loot"|"steal"} mode */
function skillFor(mode) {
  return settings.get(mode === "loot" ? "lootSkill" : "stealSkill");
}

/**
 * Re-validate the target for a user and return the context plus current mode.
 * @param {string} userId
 * @param {TargetPayload} p
 */
function validate(userId, p) {
  const ctx = context(userId, p);
  if (!ctx) return { error: "notFound" };
  // GMs are trusted: no own token or range needed (e.g. GM-only trashing).
  const ev = state.evaluate(ctx.target, ctx.own, { ignoreRange: ctx.user.isGM });
  if (!ev.mode) return { error: ev.reason };
  return { ctx, mode: ev.mode };
}

/** @param {TokenDocument} target */
async function ensureContainer(target) {
  const existing = state.container(target);
  if (existing) return existing;
  const c = await state.rollContainer(target);
  await target.setFlag(MODULE_ID, "container", c);
  return c;
}

/**
 * Whisper to a user and all GMs.
 * @param {string} content
 * @param {string[]} userIds
 */
function whisper(content, userIds) {
  const gms = game.users.filter((u) => u.isGM).map((u) => u.id);
  return ChatMessage.create({ content, whisper: [...new Set([...userIds, ...gms])] });
}

/** Delete or keep a dead token whose loot ran out. @param {TokenDocument} target */
function cleanupIfEmpty(target) {
  const c = state.container(target);
  if (!c || !isEmpty(c) || !state.tokenIsDead(target)) return;
  if (settings.get("removeEmpty") !== "delete") return;
  setTimeout(() => {
    if (target.parent?.tokens.has(target.id)) target.delete();
  }, REMOVE_DELAY_MS);
}

/* -------------------------------------------- */

/**
 * Step 1: can the user interact, and must they roll?
 * @param {string} userId
 * @param {TargetPayload} p
 */
async function prepare(userId, p) {
  const v = validate(userId, p);
  if (!v.ctx) return { ok: false, error: v.error };
  const { ctx, mode } = v;
  if (attemptBlock(state.access(ctx.target), userId)) return { ok: false, error: "locked" };
  const acc = state.access(ctx.target);
  const granted = mode === "loot" ? Boolean(acc.searched[userId]) : (acc.grants[userId] ?? 0) > 0;
  if (granted) return { ok: true, mode, needsRoll: false, granted: true };
  const needsRoll = mode === "steal" || lootDc(ctx.target) !== null;
  if (needsRoll && !ctx.actor) return { ok: false, error: "noActor" };
  return { ok: true, mode, needsRoll, skill: skillFor(mode) };
}

/**
 * Step 2: resolve the check (total rolled by the player, or null when no roll is needed).
 * @param {string} userId
 * @param {TargetPayload & {mode: "loot"|"steal", total: number|null}} p
 */
async function attempt(userId, p) {
  const v = validate(userId, p);
  if (!v.ctx) return { ok: false, error: v.error };
  const { ctx, mode } = v;
  if (mode !== p.mode) return { ok: false, error: "stateChanged" };
  let acc = state.access(ctx.target);
  if (attemptBlock(acc, userId)) return { ok: false, error: "locked" };

  const dc = mode === "loot" ? lootDc(ctx.target) : stealDc(ctx.target);
  if (dc !== null && typeof p.total !== "number") return { ok: false, error: "noRoll" };
  const success = dc === null || /** @type {number} */ (p.total) >= dc;
  const stealLimit = Math.max(1, Number(settings.get("stealLimit")));
  const targetName = ctx.target.name;
  const userName = ctx.user.name;

  if (success) {
    const c = await ensureContainer(ctx.target);
    acc = recordAttempt(acc, userId, { mode, success, lock: false, stealLimit });
    await ctx.target.setFlag(MODULE_ID, "access", acc);
    if (mode === "steal") await whisper(t("Chat.StealSuccess", { user: userName, target: targetName }), [userId]);
    if (isEmpty(c)) {
      cleanupIfEmpty(ctx.target);
      return { ok: true, success: true, empty: true };
    }
    return { ok: true, success: true };
  }

  if (mode === "loot") {
    const lock = !settings.get("lootRetry");
    acc = recordAttempt(acc, userId, { mode, success, lock, stealLimit });
    await ctx.target.setFlag(MODULE_ID, "access", acc);
    return { ok: true, success: false };
  }

  const level = state.lootConfig(ctx.target).merged.consequence || settings.get("consequence");
  const cons = failureConsequence(level, dc - /** @type {number} */ (p.total), {
    retryLock: settings.get("retryLock"),
    marginEscalation: settings.get("marginEscalation"),
  });
  acc = recordAttempt(acc, userId, { mode, success, lock: cons.lock, stealLimit });
  await ctx.target.setFlag(MODULE_ID, "access", acc);
  if (cons.noticed) {
    const speaker = ChatMessage.getSpeaker({ token: ctx.target });
    await ChatMessage.create({ speaker, content: t("Chat.StealNoticed", { user: userName, target: targetName }) });
  }
  if (cons.hostile) {
    await ctx.target.update({ disposition: CONST.TOKEN_DISPOSITIONS.HOSTILE });
    if (settings.get("combatPrompt"))
      await whisper(t("Chat.CombatPrompt", { user: userName, target: targetName }), []);
  }
  return { ok: true, success: false, noticed: cons.noticed };
}

/**
 * @param {string} userId
 * @param {TargetPayload & {mode: "loot"|"steal", ids: string[] | "all"}} p
 */
async function takeEntries(userId, p) {
  const v = validate(userId, p);
  if (!v.ctx) return { ok: false, error: v.error };
  const { ctx, mode } = v;
  if (mode !== p.mode) return { ok: false, error: "stateChanged" };
  if (!ctx.actor) return { ok: false, error: "noActor" };
  const c = state.container(ctx.target);
  if (!c) return { ok: false, error: "notGranted" };
  const acc = state.access(ctx.target);

  if (p.ids !== "all" && !(Array.isArray(p.ids) && p.ids.every((id) => typeof id === "string")))
    return { ok: false, error: "nothingSelected" };
  const count = p.ids === "all" ? c.entries.length : p.ids.length;
  const block = takeBlock(acc, userId, mode, count);
  if (block) return { ok: false, error: block };

  const stealLimit = Math.max(1, Number(settings.get("stealLimit")));
  const r = p.ids === "all" ? takeAll(c, { mode }) : take(c, p.ids, { mode, stealLimit });
  if (!r.ok) return r;

  for (const entry of r.taken) {
    if (entry.kind === "currency" && entry.denomination) {
      await system.giveCurrency(ctx.actor, entry.denomination, entry.quantity);
    } else if (entry.itemData) {
      await system.giveItem(ctx.actor, entry.itemData, entry.quantity);
    }
  }
  await moveOutSourceItems(ctx.target, r.taken);
  await ctx.target.update({
    [`flags.${MODULE_ID}.container`]: r.container,
    [`flags.${MODULE_ID}.access`]: consumeTake(acc, userId, mode, r.taken.length),
  });
  cleanupIfEmpty(ctx.target);
  return { ok: true, taken: r.taken.map((e) => e.name) };
}

/**
 * Remove items that were moved out of the token's own inventory.
 * @param {TokenDocument} target
 * @param {import("../core/loot-container.js").LootEntry[]} entries
 */
async function moveOutSourceItems(target, entries) {
  const actor = target.actor;
  if (!actor) return;
  const ids = entries.map((e) => e.sourceItemId).filter((id) => id && actor.items.has(id));
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", /** @type {string[]} */ (ids));
}

/**
 * @param {string} userId
 * @param {TargetPayload} p
 */
async function trashEntries(userId, p) {
  const v = validate(userId, p);
  if (!v.ctx) return { ok: false, error: v.error };
  const { ctx, mode } = v;
  if (mode !== "loot") return { ok: false, error: "notAllowedWhileStealing" };
  const perm = settings.get("trashPermission");
  if (perm === "off" || (perm === "gm" && !ctx.user.isGM)) return { ok: false, error: "trashNotAllowed" };
  if (!ctx.user.isGM && takeBlock(state.access(ctx.target), userId, "loot", 0)) return { ok: false, error: "notGranted" };
  const c = state.container(ctx.target);
  if (!c) return { ok: false, error: "notGranted" };

  const r = trash(c, { protectQuest: !settings.get("trashQuest") });
  await moveOutSourceItems(ctx.target, r.removed);
  await ctx.target.setFlag(MODULE_ID, "container", r.container);
  if (r.removed.length) {
    const list = r.removed.map((e) => `${e.name} ×${e.quantity}`).join(", ");
    await whisper(t("Chat.Trashed", { user: ctx.user.name, target: ctx.target.name, items: list }), []);
  }
  cleanupIfEmpty(ctx.target);
  return { ok: true };
}

export const handlers = { prepare, attempt, take: takeEntries, trash: trashEntries };

/* -------------------------------------------- */
/*  GM tools (called directly on the GM client)  */
/* -------------------------------------------- */

/** @param {TokenDocument} token */
export async function reroll(token) {
  const c = await state.rollContainer(token);
  await token.setFlag(MODULE_ID, "container", c);
  return c;
}

/** @param {TokenDocument} token */
export async function clearLoot(token) {
  await token.unsetFlag(MODULE_ID, "container");
}

/** @param {TokenDocument} token */
export async function resetAccess(token) {
  await token.unsetFlag(MODULE_ID, "access");
}
