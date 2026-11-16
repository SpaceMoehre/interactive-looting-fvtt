import { test } from "node:test";
import assert from "node:assert/strict";
import { isDead, interactionMode } from "../scripts/core/targeting.js";

const both = { useDeadStatus: true, useZeroHp: true };

test("dead status marks a token dead", () => {
  assert.equal(isDead({ statuses: ["dead"], hp: 10 }, both), true);
});

test("zero or negative HP marks a token dead", () => {
  assert.equal(isDead({ statuses: [], hp: 0 }, both), true);
  assert.equal(isDead({ statuses: [], hp: -3 }, both), true);
});

test("living, unknown-HP and disabled-rule cases are not dead", () => {
  assert.equal(isDead({ statuses: ["unconscious"], hp: 5 }, both), false);
  assert.equal(isDead({ statuses: [], hp: null }, both), false);
  assert.equal(isDead({ statuses: [], hp: 0 }, { useDeadStatus: true, useZeroHp: false }), false);
  assert.equal(isDead({ statuses: ["dead"], hp: 5 }, { useDeadStatus: false, useZeroHp: true }), false);
});

/** @param {Partial<Parameters<typeof interactionMode>[0]>} over */
const target = (over = {}) => ({
  isPlayerCharacter: false,
  dead: false,
  distance: 5,
  maxDistance: 5,
  hasOwnToken: true,
  ...over,
});

test("dead NPC with loot in range is looted", () => {
  assert.deepEqual(interactionMode(target({ dead: true })), { mode: "loot" });
});

test("living NPC with loot in range is robbed", () => {
  assert.deepEqual(interactionMode(target()), { mode: "steal" });
});

test("player characters are never targetable", () => {
  assert.deepEqual(interactionMode(target({ isPlayerCharacter: true, dead: true })), {
    mode: null,
    reason: "playerCharacter",
  });
});

test("tokens without loot can still be looted or stolen from (the window shows them empty)", () => {
  assert.deepEqual(interactionMode(target({ dead: true })), { mode: "loot" });
  assert.deepEqual(interactionMode(target({ dead: false })), { mode: "steal" });
});

test("player must control a token within range unless range is disabled", () => {
  assert.deepEqual(interactionMode(target({ hasOwnToken: false })), { mode: null, reason: "noToken" });
  assert.deepEqual(interactionMode(target({ distance: 10 })), { mode: null, reason: "outOfRange" });
  assert.deepEqual(interactionMode(target({ distance: 100, maxDistance: null, hasOwnToken: false })), {
    mode: "steal",
  });
});
