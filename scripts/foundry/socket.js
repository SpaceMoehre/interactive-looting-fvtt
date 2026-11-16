/**
 * Player → GM request/response over the module socket channel.
 * Exactly one GM (the active GM) executes requests, one at a time, so concurrent
 * "take" clicks are applied in order (first click wins).
 * Live sync to every client happens through the normal token document update.
 */
import { MODULE_ID, randomId } from "../core/loot-sources.js";

const CHANNEL = `module.${MODULE_ID}`;
const TIMEOUT_MS = 15000;

/** @type {Record<string, (userId: string, payload: any) => Promise<any>>} */
let handlers = {};
/** @type {Map<string, (result: any) => void>} */
const pending = new Map();
/** @type {Promise<any>} */
let queue = Promise.resolve();

export function isResponsibleGM() {
  return game.user.isGM && game.users.activeGM?.id === game.user.id;
}

/**
 * @param {string} action
 * @param {string} userId
 * @param {any} payload
 */
function execute(action, userId, payload) {
  const run = async () => {
    const handler = handlers[action];
    if (!handler) return { ok: false, error: "unknownAction" };
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    // A handler that never settles must not block every later request.
    const stuck = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
    });
    try {
      return await Promise.race([handler(userId, payload), stuck]);
    } catch (err) {
      console.error(`${MODULE_ID} | ${action} failed`, err);
      return { ok: false, error: "internal" };
    } finally {
      clearTimeout(timer);
    }
  };
  const result = queue.then(run, run);
  queue = result;
  return result;
}

/** @param {typeof handlers} h */
export function initSocket(h) {
  handlers = h;
  game.socket.on(CHANNEL, async (/** @type {any} */ msg, /** @type {string|undefined} */ senderId) => {
    if (msg?.type === "request" && isResponsibleGM()) {
      // Only trust the server-supplied sender; a client-supplied id could impersonate another user.
      if (!senderId) return console.warn(`${MODULE_ID} | dropped request without a sender id`);
      const userId = senderId;
      const result = await execute(msg.action, userId, msg.payload);
      game.socket.emit(CHANNEL, { type: "response", id: msg.id, to: userId, result });
    } else if (msg?.type === "response" && msg.to === game.user.id) {
      pending.get(msg.id)?.(msg.result);
      pending.delete(msg.id);
    }
  });
}

/**
 * Ask the GM to perform an action. Resolves with the handler's result.
 * @param {string} action
 * @param {any} payload
 * @returns {Promise<any>}
 */
export function request(action, payload) {
  if (isResponsibleGM()) return execute(action, game.user.id, payload);
  if (!game.users.activeGM) return Promise.resolve({ ok: false, error: "noGm" });
  const id = randomId();
  return new Promise((resolve) => {
    pending.set(id, resolve);
    game.socket.emit(CHANNEL, { type: "request", id, userId: game.user.id, action, payload });
    setTimeout(() => {
      if (pending.delete(id)) resolve({ ok: false, error: "noGm" });
    }, TIMEOUT_MS);
  });
}
