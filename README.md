# Interactive Looting (Foundry VTT v14)

Players loot defeated tokens and pick the pockets of living NPCs with a skill check. A small loot window shows what they can take. Built for D&D 5e, and it works with other systems once you set the data paths.

## How it plays

- **Target** an NPC token and press **L** (rebindable), or **double-click** it (on by default, can be turned off in the settings).
- **Dead** tokens (dead status and/or 0 HP) are **looted**. You can require an Investigation check (off by default).
- **Living** tokens are **stolen from** with a Sleight of Hand check against the target's passive Perception, or against a fixed DC you set.
  - A successful steal lets the thief take one item (the number is configurable).
  - A failed steal is silent, noticed or hostile, depending on the setting.
- The loot window lists each item's icon, name and amount with a checkbox. It has **Take**, **Take all** and **Trash** buttons (Trash asks for confirmation).
  - Open windows stay in sync between players. If two players click the same item, the first click wins.
- When the last item is taken from a dead token, the token is removed. Looting a dead token that has nothing removes it right away. With **Empty dead tokens → Keep** in the settings, the token stays and the window shows it empty instead.
- Stealing from a living token with nothing on it still takes a roll; on a success the window is empty.
- A GM must be online. The GM's client checks every request and makes the changes.

## For the GM

- **Settings → Loot tables & tiers** sets the default table and the tier tables (for example CR 0–4, 5–10, 11+), each optionally limited to a creature type and with its own DC.
- **The Loot tab** in Token config and Prototype Token config sets:
  - a table override, a secondary (quest) table and quest items (drag them in);
  - DC overrides and the failed-steal consequence;
  - a preview of the stored loot, with buttons to re-roll, clear it, or reset player attempts.
- **Which table is used:** the first match wins, in this order: token → actor prototype → tier → default. The table is rolled on the first successful loot or steal, and the result is kept. Items you add to the token's inventory or to its quest items later are added to the loot, and ones you remove are taken out; use **Re-roll** in the Loot tab to roll the tables again.
- **Inventory items:** items on a placed (unlinked) token that its actor doesn't normally carry are lootable as quest loot. Any item with `flags.interactive-looting.loot = true` is lootable too.
- **Currency** comes from table text results such as `2d6 gp` or `[[3d10*5]] sp`.

## Installation

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://github.com/SpaceMoehre/interactive-looting-fvtt/releases/latest/download/module.json
```

## Releasing

Push a version tag. CI runs the tests, stamps the version into `module.json` and publishes a GitHub release with `module.json` and `module.zip`:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

## Development

```bash
npm install
npm test          # unit tests for the pure rules in scripts/core
npm run typecheck # tsc --checkJs over scripts/core and test
```

`scripts/core` contains the rules as pure functions, which are unit-tested. `scripts/foundry` is the Foundry adapter (settings, socket, GM handlers, UI) and has no unit tests.
