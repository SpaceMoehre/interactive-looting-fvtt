import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTable } from "../scripts/core/table-resolution.js";

const tiers = [
  { min: 0, max: 4, table: "Minor" },
  { min: 5, max: 10, table: "Mid" },
  { min: 11, max: null, table: "Boss" },
];

test("token override wins over everything", () => {
  assert.equal(
    resolveTable({ tokenTable: "T", actorTable: "A", tiers, defaultTable: "D", power: 12 }),
    "T",
  );
});

test("actor override wins when the token has none", () => {
  assert.equal(resolveTable({ actorTable: "A", tiers, defaultTable: "D", power: 12 }), "A");
});

test("power picks the matching tier", () => {
  assert.equal(resolveTable({ tiers, defaultTable: "D", power: 0.5 }), "Minor");
  assert.equal(resolveTable({ tiers, defaultTable: "D", power: 7 }), "Mid");
  assert.equal(resolveTable({ tiers, defaultTable: "D", power: 30 }), "Boss");
});

test("a type-filtered tier only matches that creature type and is preferred", () => {
  const typed = [{ min: 0, max: null, type: "undead", table: "Crypt" }, ...tiers];
  assert.equal(resolveTable({ tiers: typed, power: 2, creatureType: "Undead" }), "Crypt");
  assert.equal(resolveTable({ tiers: typed, power: 2, creatureType: "beast" }), "Minor");
});

test("global default applies when nothing else matches or power is unknown", () => {
  assert.equal(resolveTable({ tiers, defaultTable: "D", power: null }), "D");
  assert.equal(resolveTable({ tiers: [], defaultTable: "D", power: 3 }), "D");
});

test("returns null when no source exists", () => {
  assert.equal(resolveTable({ tiers: [], power: 3 }), null);
});
