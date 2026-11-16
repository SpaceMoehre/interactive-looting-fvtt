/**
 * Interactive Looting — entry point.
 * Players loot dead tokens and steal from living ones; the active GM validates
 * every request over the module socket and owns all document writes.
 */
import { MODULE_ID } from "./core/loot-sources.js";
import { registerSettings, migrate } from "./foundry/settings.js";
import { initSocket } from "./foundry/socket.js";
import * as gm from "./foundry/gm.js";
import { registerKeybinding, patchDoubleClick, addHudButton } from "./foundry/interaction.js";
import { LootWindow } from "./foundry/loot-window.js";
import { injectTab } from "./foundry/token-config.js";
import * as state from "./foundry/state.js";

const TEMPLATES = ["loot-window", "token-config", "tier-config", "help"].map((n) => `modules/${MODULE_ID}/templates/${n}.hbs`);

Hooks.once("init", () => {
  registerSettings();
  registerKeybinding();
  const load = foundry.applications.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  load(TEMPLATES);
});

Hooks.once("setup", () => {
  patchDoubleClick();
});

Hooks.once("ready", () => {
  initSocket(gm.handlers);
  migrate();
  if (game.user.isGM && game.modules.get("item-piles")?.active) {
    ui.notifications.info(game.i18n.localize("INTERACTIVE_LOOTING.Notify.ItemPiles"));
  }
});

// Live sync: any change to our flags re-renders (or closes) open loot windows.
Hooks.on("updateToken", (token, changes) => {
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`) || foundry.utils.hasProperty(changes, `flags.-=${MODULE_ID}`)) {
    LootWindow.refresh(token);
  }
});
Hooks.on("deleteToken", (token) => LootWindow.refresh(token, true));

// Items the GM gives a token after its loot was rolled are added to the loot.
// Only the active GM writes; the resulting flag update re-renders open windows.
/** @param {TokenDocument} token */
const syncLoot = (token) => {
  if (!game.users.activeGM?.isSelf || !state.container(token)) return;
  state.syncContainer(token).catch((err) => console.error(`${MODULE_ID} | failed to update loot`, err));
};
Hooks.on("createItem", (item) => {
  /** @type {any} */
  const actor = item.parent;
  if (!(actor instanceof Actor)) return;
  const tokens = actor.isToken ? [actor.token] : (actor.getDependentTokens?.() ?? []);
  for (const token of tokens) if (token) syncLoot(token);
});
Hooks.on("updateToken", (token, changes) => {
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.config`)) syncLoot(token);
});

Hooks.on("renderTokenHUD", (hud, html) => addHudButton(hud, html instanceof HTMLElement ? html : html[0]));

for (const hook of ["renderTokenConfig", "renderPrototypeTokenConfig"]) {
  Hooks.on(hook, (app, element) => {
    injectTab(app, element instanceof HTMLElement ? element : element[0]).catch((err) =>
      console.error(`${MODULE_ID} | failed to add the Loot tab`, err),
    );
  });
}
