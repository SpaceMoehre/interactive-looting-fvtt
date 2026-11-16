/**
 * Per-user access state for one token, stored next to its loot container.
 * @typedef {object} AccessState
 * @property {Record<string, true>} locks     users who may not attempt again
 * @property {Record<string, true>} searched  users who passed the loot (search) check
 * @property {Record<string, number>} grants  remaining steal takes per user
 */

/** @returns {AccessState} */
export function emptyAccess() {
  return { locks: {}, searched: {}, grants: {} };
}

/**
 * Record the result of a loot or steal attempt.
 * @param {AccessState} s
 * @param {string} userId
 * @param {{mode: "loot"|"steal", success: boolean, lock: boolean, stealLimit: number}} r
 * @returns {AccessState}
 */
export function recordAttempt(s, userId, { mode, success, lock, stealLimit }) {
  const next = { locks: { ...s.locks }, searched: { ...s.searched }, grants: { ...s.grants } };
  if (success && mode === "loot") next.searched[userId] = true;
  // Every steal attempt replaces what the last one granted, so a failure cancels unused takes.
  if (mode === "steal") next.grants[userId] = success ? stealLimit : 0;
  if (!success && lock) next.locks[userId] = true;
  return next;
}

/**
 * Whether the user may open the loot again without rolling. A passed search
 * lasts; stealing always needs a new roll.
 * @param {AccessState} s
 * @param {string} userId
 * @param {"loot"|"steal"} mode
 */
export function opensWithoutRoll(s, userId, mode) {
  return mode === "loot" && Boolean(s.searched[userId]);
}

/**
 * @param {AccessState} s
 * @param {string} userId
 * @returns {"locked"|null}
 */
export function attemptBlock(s, userId) {
  return s.locks[userId] ? "locked" : null;
}

/**
 * Why a user may not take `count` entries right now, or null if allowed.
 * @param {AccessState} s
 * @param {string} userId
 * @param {"loot"|"steal"} mode
 * @param {number} count
 * @returns {"notGranted"|"stealLimit"|null}
 */
export function takeBlock(s, userId, mode, count) {
  if (mode === "loot") return s.searched[userId] ? null : "notGranted";
  const left = s.grants[userId] ?? 0;
  if (left <= 0) return "notGranted";
  return count > left ? "stealLimit" : null;
}

/**
 * Use up steal grants after a successful take. Loot-mode access is not consumed.
 * @param {AccessState} s
 * @param {string} userId
 * @param {"loot"|"steal"} mode
 * @param {number} count
 * @returns {AccessState}
 */
export function consumeTake(s, userId, mode, count) {
  if (mode === "loot") return s;
  const grants = { ...s.grants };
  // Keep the key at 0 rather than deleting it: Foundry merges flag objects on update,
  // so a deleted key would leave the stored count untouched.
  grants[userId] = Math.max(0, (grants[userId] ?? 0) - count);
  return { ...s, grants };
}
