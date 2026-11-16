import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAccess, recordAttempt, attemptBlock, takeBlock, consumeTake } from "../scripts/core/access.js";

const U = "user1";

test("a fresh token has no blocks for attempting but nothing may be taken yet", () => {
  const s = emptyAccess();
  assert.equal(attemptBlock(s, U), null);
  assert.equal(takeBlock(s, U, "loot", 1), "notGranted");
  assert.equal(takeBlock(s, U, "steal", 1), "notGranted");
});

test("a successful search lets that user take freely in loot mode", () => {
  const s = recordAttempt(emptyAccess(), U, { mode: "loot", success: true, lock: false, stealLimit: 1 });
  assert.equal(takeBlock(s, U, "loot", 5), null);
  assert.equal(takeBlock(s, "other", "loot", 1), "notGranted");
});

test("a successful steal grants a limited number of takes that are consumed", () => {
  let s = recordAttempt(emptyAccess(), U, { mode: "steal", success: true, lock: false, stealLimit: 1 });
  assert.equal(takeBlock(s, U, "steal", 2), "stealLimit");
  assert.equal(takeBlock(s, U, "steal", 1), null);
  s = consumeTake(s, U, "steal", 1);
  assert.equal(takeBlock(s, U, "steal", 1), "notGranted");
});

test("used-up grants are stored as 0 so a merge-style document update overwrites the old count", () => {
  let s = recordAttempt(emptyAccess(), U, { mode: "steal", success: true, lock: false, stealLimit: 1 });
  s = consumeTake(s, U, "steal", 1);
  assert.deepEqual(s.grants, { [U]: 0 });
});

test("consuming loot-mode takes leaves the search grant intact", () => {
  let s = recordAttempt(emptyAccess(), U, { mode: "loot", success: true, lock: false, stealLimit: 1 });
  s = consumeTake(s, U, "loot", 3);
  assert.equal(takeBlock(s, U, "loot", 1), null);
});

test("a locking failure blocks further attempts by that user only", () => {
  const s = recordAttempt(emptyAccess(), U, { mode: "steal", success: false, lock: true, stealLimit: 1 });
  assert.equal(attemptBlock(s, U), "locked");
  assert.equal(attemptBlock(s, "other"), null);
});

test("a non-locking failure allows retry", () => {
  const s = recordAttempt(emptyAccess(), U, { mode: "loot", success: false, lock: false, stealLimit: 1 });
  assert.equal(attemptBlock(s, U), null);
});

test("recordAttempt does not mutate its input", () => {
  const s = emptyAccess();
  recordAttempt(s, U, { mode: "steal", success: false, lock: true, stealLimit: 1 });
  assert.deepEqual(s, emptyAccess());
});
