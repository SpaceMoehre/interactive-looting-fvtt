/**
 * Whether a token counts as dead ("death marked").
 * @param {{statuses: Iterable<string>, hp: number|null|undefined}} token
 * @param {{useDeadStatus: boolean, useZeroHp: boolean}} rules
 */
export function isDead({ statuses, hp }, { useDeadStatus, useZeroHp }) {
  if (useDeadStatus && [...statuses].includes("dead")) return true;
  if (useZeroHp && typeof hp === "number" && Number.isFinite(hp) && hp <= 0) return true;
  return false;
}

/**
 * @typedef {"loot"|"steal"} Mode
 * @typedef {"playerCharacter"|"noToken"|"outOfRange"} BlockReason
 */

/**
 * Decide what a player may do with a target token.
 * @param {object} t
 * @param {boolean} t.isPlayerCharacter
 * @param {boolean} t.dead
 * @param {number|null} t.distance    distance from the player's token, null if unknown
 * @param {number|null} t.maxDistance null disables the range requirement
 * @param {boolean} t.hasOwnToken     the player controls a token on this scene
 * @returns {{mode: Mode} | {mode: null, reason: BlockReason}}
 */
export function interactionMode(t) {
  if (t.isPlayerCharacter) return { mode: null, reason: "playerCharacter" };
  if (t.maxDistance != null) {
    if (!t.hasOwnToken) return { mode: null, reason: "noToken" };
    if (t.distance == null || t.distance > t.maxDistance) return { mode: null, reason: "outOfRange" };
  }
  return { mode: t.dead ? "loot" : "steal" };
}
