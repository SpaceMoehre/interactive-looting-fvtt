import { test } from "node:test";
import assert from "node:assert/strict";
import { lootCheckDc, stealCheckDc, failureConsequence } from "../scripts/core/checks.js";

test("loot check is skipped when disabled", () => {
  assert.equal(lootCheckDc({ enabled: false, fixedDc: 15, tierDc: 20, defaultDc: 10 }), null);
});

test("loot check DC: fixed override, then tier DC, then default", () => {
  assert.equal(lootCheckDc({ enabled: true, fixedDc: 15, tierDc: 20, defaultDc: 10 }), 15);
  assert.equal(lootCheckDc({ enabled: true, fixedDc: null, tierDc: 20, defaultDc: 10 }), 20);
  assert.equal(lootCheckDc({ enabled: true, fixedDc: null, tierDc: null, defaultDc: 10 }), 10);
});

test("steal DC: fixed override beats passive perception, which beats the default", () => {
  assert.equal(stealCheckDc({ fixedDc: 18, passive: 12, defaultDc: 10 }), 18);
  assert.equal(stealCheckDc({ fixedDc: null, passive: 12, defaultDc: 10 }), 12);
  assert.equal(stealCheckDc({ fixedDc: null, passive: null, defaultDc: 10 }), 10);
});

const opts = { retryLock: true, marginEscalation: false };

test("silent failure: no notice, no lock, no hostility", () => {
  assert.deepEqual(failureConsequence("silent", 2, opts), {
    noticed: false,
    lock: false,
    hostile: false,
  });
});

test("noticed failure: public notice and retry lock", () => {
  assert.deepEqual(failureConsequence("noticed", 2, opts), { noticed: true, lock: true, hostile: false });
  assert.deepEqual(failureConsequence("noticed", 2, { ...opts, retryLock: false }), {
    noticed: true,
    lock: false,
    hostile: false,
  });
});

test("hostile failure adds hostility on top of noticed", () => {
  assert.deepEqual(failureConsequence("hostile", 1, opts), { noticed: true, lock: true, hostile: true });
});

test("margin escalation: failing by 5+ turns silent into noticed", () => {
  const esc = { ...opts, marginEscalation: true };
  assert.equal(failureConsequence("silent", 5, esc).noticed, true);
  assert.equal(failureConsequence("silent", 4, esc).noticed, false);
});
