import { test } from "node:test";
import assert from "node:assert/strict";
import { specialItems, parseCurrencyText, currencyFromResult, mergeDrafts } from "../scripts/core/loot-sources.js";

const MOD = "interactive-looting";

test("items added to an unlinked token (not on its base actor) are special loot", () => {
  const tokenItems = [{ _id: "claw" }, { _id: "dagger1" }, { _id: "dagger2" }];
  const baseIds = ["claw", "dagger1"];
  assert.deepEqual(specialItems(tokenItems, baseIds).map((i) => i._id), ["dagger2"]);
});

test("normal gear flagged as loot is included; linked tokens rely on the flag only", () => {
  const items = [{ _id: "sword", flags: { [MOD]: { loot: true } } }, { _id: "claw" }];
  assert.deepEqual(specialItems(items, ["sword", "claw"]).map((i) => i._id), ["sword"]);
  assert.deepEqual(specialItems(items, null).map((i) => i._id), ["sword"]);
});

test("currency text results are recognised in plain and inline-roll form", () => {
  const denoms = ["pp", "gp", "ep", "sp", "cp"];
  assert.deepEqual(parseCurrencyText("2d6 gp", denoms), { formula: "2d6", denomination: "gp" });
  assert.deepEqual(parseCurrencyText("[[3d10*5]] SP", denoms), { formula: "3d10*5", denomination: "sp" });
  assert.deepEqual(parseCurrencyText("<p>47 gp</p>", denoms), { formula: "47", denomination: "gp" });
  assert.equal(parseCurrencyText("A rusty key", denoms), null);
  assert.equal(parseCurrencyText("12 apples", denoms), null);
});

test("Foundry inline-roll commands and HTML spaces are accepted in currency text", () => {
  const denoms = ["gp", "sp"];
  assert.deepEqual(parseCurrencyText("[[/r 2d6]] gp", denoms), { formula: "2d6", denomination: "gp" });
  assert.deepEqual(parseCurrencyText("[[/roll 4d4*10]] sp", denoms), { formula: "4d4*10", denomination: "sp" });
  assert.deepEqual(parseCurrencyText("<p>3d6&nbsp;gp</p>", denoms), { formula: "3d6", denomination: "gp" });
});

test("a result named e.g. 'Gold' with the amount in its description is still currency", () => {
  const denoms = ["gp"];
  assert.deepEqual(currencyFromResult({ name: "Gold", description: "<p>2d6 gp</p>" }, denoms), {
    formula: "2d6",
    denomination: "gp",
  });
  assert.deepEqual(currencyFromResult({ name: "10 gp", description: "" }, denoms), { formula: "10", denomination: "gp" });
  assert.equal(currencyFromResult({ name: "Rusty key", description: "Opens the cellar" }, denoms), null);
});

test("duplicate drafts merge their quantities; quest and normal drafts stay separate", () => {
  const merged = mergeDrafts([
    { key: "Item.arrow", kind: "item", name: "Arrow", img: "", quantity: 10, quest: false },
    { key: "Item.arrow", kind: "item", name: "Arrow", img: "", quantity: 5, quest: false },
    { key: "gp", kind: "currency", name: "gp", img: "", quantity: 7, quest: false, denomination: "gp" },
    { key: "gp", kind: "currency", name: "gp", img: "", quantity: 3, quest: false, denomination: "gp" },
    { key: "Item.arrow", kind: "item", name: "Arrow", img: "", quantity: 1, quest: true },
  ]);
  assert.deepEqual(
    merged.map((e) => [e.name, e.quantity, e.quest]),
    [
      ["Arrow", 15, false],
      ["gp", 10, false],
      ["Arrow", 1, true],
    ],
  );
  assert.equal(new Set(merged.map((e) => e.id)).size, 3);
});
