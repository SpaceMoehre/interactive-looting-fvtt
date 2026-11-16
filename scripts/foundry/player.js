/**
 * The token the current user acts with on the active scene (never the target itself).
 * @param {TokenDocument} target
 * @returns {TokenDocument|null}
 */
export function ownToken(target) {
  const controlled = canvas.tokens?.controlled.find((t) => t.actor?.isOwner && t.document.id !== target.id);
  if (controlled) return controlled.document;
  const own = game.user.character?.getActiveTokens(false, true).find((/** @type {any} */ t) => t.id !== target.id);
  return own ?? null;
}

/**
 * Identifies the target and the acting token in requests to the GM.
 * @param {TokenDocument} target
 */
export function payloadFor(target) {
  return { sceneId: target.parent.id, tokenId: target.id, ownTokenId: ownToken(target)?.id ?? null };
}
