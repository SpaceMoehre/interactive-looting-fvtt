import { test } from "node:test";
import assert from "node:assert/strict";
import { take, takeAll, trash, isEmpty, displayEntries, reconcile } from "../scripts/core/loot-container.js";

/** @returns {import("../scripts/core/loot-container.js").LootContainer} */
const container = () => ({
  entries: [
    { id: "a", kind: "item", name: "Dagger", img: "d.png", quantity: 1, quest: false },
    { id: "b", kind: "item", name: "arrow", img: "a.png", quantity: 12, quest: false },
    { id: "c", kind: "currency", name: "gp", img: "", quantity: 47, quest: false, denomination: "gp" },
    { id: "q", kind: "item", name: "Sealed Letter", img: "l.png", quantity: 1, quest: true },
  ],
});

test("take removes the selected entries and returns them", () => {
  const r = take(container(), ["a", "c"], { mode: "loot", stealLimit: 1 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.taken.map((e) => e.id), ["a", "c"]);
  assert.deepEqual(r.container.entries.map((e) => e.id), ["b", "q"]);
});

test("take does not mutate the input container", () => {
  const c = container();
  take(c, ["a"], { mode: "loot", stealLimit: 1 });
  assert.equal(c.entries.length, 4);
});

test("first click wins: entries already gone are skipped, all gone is an error", () => {
  const partial = take(container(), ["a", "zzz"], { mode: "loot", stealLimit: 1 });
  assert.deepEqual(partial.ok && partial.taken.map((e) => e.id), ["a"]);
  assert.deepEqual(take(container(), ["zzz"], { mode: "loot", stealLimit: 1 }), {
    ok: false,
    error: "alreadyTaken",
  });
});

test("taking nothing is an error", () => {
  assert.deepEqual(take(container(), [], { mode: "loot", stealLimit: 1 }), {
    ok: false,
    error: "nothingSelected",
  });
});

test("steal mode limits how many entries one success may take", () => {
  assert.deepEqual(take(container(), ["a", "b"], { mode: "steal", stealLimit: 1 }), {
    ok: false,
    error: "stealLimit",
  });
  assert.equal(take(container(), ["a", "b"], { mode: "steal", stealLimit: 2 }).ok, true);
});

test("take all empties the container in loot mode but is refused when stealing", () => {
  const r = takeAll(container(), { mode: "loot" });
  assert.equal(r.ok && r.taken.length, 4);
  assert.equal(r.ok && isEmpty(r.container), true);
  assert.deepEqual(takeAll(container(), { mode: "steal" }), { ok: false, error: "notAllowedWhileStealing" });
});

test("trash protects quest entries by default", () => {
  const r = trash(container(), { protectQuest: true });
  assert.deepEqual(r.removed.map((e) => e.id), ["a", "b", "c"]);
  assert.deepEqual(r.container.entries.map((e) => e.id), ["q"]);
  assert.equal(isEmpty(r.container), false);
});

test("trash can remove quest entries too", () => {
  const r = trash(container(), { protectQuest: false });
  assert.equal(isEmpty(r.container), true);
});

test("display entries are sorted by name, case-insensitively, mixing quest items in", () => {
  assert.deepEqual(displayEntries(container()).map((e) => e.name), ["arrow", "Dagger", "gp", "Sealed Letter"]);
});

test("display entries hide the quest marker from players", () => {
  assert.equal(displayEntries(container()).some((e) => "quest" in e), false);
});

test("reconcile: items added to the token's inventory after the roll are reported as new", () => {
  /** @type {import("../scripts/core/loot-container.js").LootContainer} */
  const c = { entries: [{ id: "x", kind: "item", name: "Ring", img: "", quantity: 1, quest: true, sourceItemId: "ring" }], questSources: [] };
  const r = reconcile(c, { ownItemIds: ["ring", "gem"], questUuids: [] });
  assert.deepEqual(r.addOwn, ["gem"]);
  assert.deepEqual(r.container.entries.map((e) => e.id), ["x"]);
});

test("reconcile: inventory items the GM deleted disappear from the loot", () => {
  /** @type {import("../scripts/core/loot-container.js").LootContainer} */
  const c = { entries: [{ id: "x", kind: "item", name: "Ring", img: "", quantity: 1, quest: true, sourceItemId: "ring" }], questSources: [] };
  const r = reconcile(c, { ownItemIds: [], questUuids: [] });
  assert.deepEqual(r.container.entries, []);
  assert.deepEqual(r.addOwn, []);
});

test("reconcile: quest items added in the Loot tab are added once, even after being taken", () => {
  /** @type {import("../scripts/core/loot-container.js").LootContainer} */
  const c = { entries: [], questSources: ["Item.letter"] };
  const r = reconcile(c, { ownItemIds: [], questUuids: ["Item.letter", "Item.key"] });
  assert.deepEqual(r.addUuids, ["Item.key"]);
  assert.deepEqual(r.container.questSources, ["Item.letter", "Item.key"]);
});

test("reconcile: quest items removed in the Loot tab disappear from the loot", () => {
  /** @type {import("../scripts/core/loot-container.js").LootContainer} */
  const c = {
    entries: [{ id: "k", kind: "item", name: "Key", img: "", quantity: 1, quest: true, sourceUuid: "Item.key" }],
    questSources: ["Item.key"],
  };
  const r = reconcile(c, { ownItemIds: [], questUuids: [] });
  assert.deepEqual(r.container.entries, []);
  assert.deepEqual(r.container.questSources, []);
});

test("reconcile: containers saved before quest tracking treat current quest items as already added", () => {
  /** @type {import("../scripts/core/loot-container.js").LootContainer} */
  const c = { entries: [] };
  const r = reconcile(c, { ownItemIds: [], questUuids: ["Item.letter"] });
  assert.deepEqual(r.addUuids, []);
  assert.deepEqual(r.container.questSources, ["Item.letter"]);
});
