/**
 * @typedef {object} Tier
 * @property {number|null} [min]   inclusive lower bound of the power value (null = unbounded)
 * @property {number|null} [max]   inclusive upper bound of the power value (null = unbounded)
 * @property {string} [type]       optional creature type filter (case-insensitive)
 * @property {string} table        RollTable UUID
 * @property {number|null} [dc]    optional loot-check DC for this tier
 */

/**
 * Find the tier matching a power value and creature type.
 * Tiers with a matching type filter are preferred over untyped tiers;
 * otherwise the first matching tier in list order wins.
 * @param {Tier[]} tiers
 * @param {number|null|undefined} power
 * @param {string|null} [creatureType]
 * @returns {Tier|null}
 */
export function matchTier(tiers, power, creatureType) {
  if (power === null || power === undefined || !Number.isFinite(power)) return null;
  const type = creatureType?.toLowerCase() ?? null;
  const inRange = tiers.filter(
    (t) => (t.min == null || power >= t.min) && (t.max == null || power <= t.max),
  );
  const typed = inRange.find((t) => t.type && type && t.type.toLowerCase() === type);
  if (typed) return typed;
  return inRange.find((t) => !t.type) ?? null;
}

/**
 * Resolve which table a token uses. First match wins:
 * token override → actor override → tier rule → global default.
 * @param {object} args
 * @param {string|null} [args.tokenTable]
 * @param {string|null} [args.actorTable]
 * @param {Tier[]} [args.tiers]
 * @param {string|null} [args.defaultTable]
 * @param {number|null} [args.power]
 * @param {string|null} [args.creatureType]
 * @returns {string|null}
 */
export function resolveTable({ tokenTable, actorTable, tiers = [], defaultTable, power, creatureType }) {
  return (
    tokenTable || actorTable || matchTier(tiers, power, creatureType)?.table || defaultTable || null
  );
}
