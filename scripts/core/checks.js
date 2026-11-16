/**
 * DC for searching a dead token, or null when no check is required.
 * @param {{enabled: boolean, fixedDc: number|null, tierDc: number|null, defaultDc: number}} c
 * @returns {number|null}
 */
export function lootCheckDc({ enabled, fixedDc, tierDc, defaultDc }) {
  if (!enabled) return null;
  return fixedDc ?? tierDc ?? defaultDc;
}

/**
 * DC for robbing a living token: fixed override, else the target's passive value.
 * @param {{fixedDc: number|null, passive: number|null, defaultDc: number}} c
 * @returns {number}
 */
export function stealCheckDc({ fixedDc, passive, defaultDc }) {
  return fixedDc ?? passive ?? defaultDc;
}

/** @typedef {"silent"|"noticed"|"hostile"} ConsequenceLevel */

/**
 * What happens when a steal check fails.
 * @param {ConsequenceLevel} level
 * @param {number} margin   how much the check missed the DC by (DC - total)
 * @param {{retryLock: boolean, marginEscalation: boolean}} opts
 * @returns {{noticed: boolean, lock: boolean, hostile: boolean}}
 */
export function failureConsequence(level, margin, { retryLock, marginEscalation }) {
  let effective = level;
  if (effective === "silent" && marginEscalation && margin >= 5) effective = "noticed";
  const noticed = effective !== "silent";
  return { noticed, lock: noticed && retryLock, hostile: effective === "hostile" };
}
