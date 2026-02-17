import { moduleId, localizationID } from './const.js';
// Ensure these paths match where you save your files!
import { PartyInventory } from './party-inventory.js'; 
import { SplitCurrency } from "./apps/split-currency.js";
import { TakeCurrency } from "./apps/take-currency.js";
// You haven't sent sheet-inject.js yet, but we'll assume it's there
import { addTogglePartyButton, addTogglePartyButtonTidy, addGroupInventoryIndicatorTidy } from './sheet-inject.js';

Hooks.on('setup', () => {
    const debouncedReload = foundry.utils.debounce(() => window.location.reload(), 100);

    game.settings.register(moduleId, 'scratchpad', { 
        scope: 'world',
        config: false, // Internal data setting
        type: Object,
        default: {
            items: {},
            order: []
        },
        onChange: () => PartyInventory.refresh()
    });

    game.settings.register(moduleId, 'currency', { 
        scope: 'world',
        config: false,
        type: Object,
        default: {
            pp: 0, gp: 0, ep: 0, sp: 0, cp: 0
        },
        onChange: () => PartyInventory.refresh()
    });

    game.settings.register(moduleId, 'excludedActors', { 
        scope: 'world',
        config: false,
        type: Object,
        default: [],
        onChange: () => {
            // Updated to use the new V13 ApplicationV2 registry logic if possible, 
            // but Object.values(ui.windows) is still the standard fallback for finding open apps.
            Object.values(ui.windows)
                .filter(w => w instanceof SplitCurrency)
                .forEach(w => w.render());
        }
    });

    game.settings.register(moduleId, 'controlButtonGroup', {
        name: `${localizationID}.setting-control-group`,
        scope: 'client',
        config: true,
        type: String,
        default: "token",
        choices: {
            "token": `${localizationID}.token-group`,
            "notes": `${localizationID}.notes-group`
        },
        onChange: debouncedReload
    });

    game.settings.register(moduleId, 'currencyNotifications', {
        name: `${localizationID}.setting-currency-notifications`,
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(moduleId, 'deleteActorItemOnDrag', {
        name: `${localizationID}.setting-delete-actor-item-on-drag`,
        hint: `${localizationID}.setting-delete-actor-item-on-drag-hint`,
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });
});

Hooks.on('renderActorSheet5eCharacter', (sheet, html, context) => {
    // V13/Modern Tidy5e checks
    // Note: html is usually a jQuery object in V12/V13 for legacy sheets, but might be HTMLElement for AppV2 sheets.
    // We wrap it in $() just to be safe if you are still using jQuery in inject scripts.
    const $html = $(html); 
    const sheetClasses = sheet.options.classes || [];

    if (sheetClasses.includes("tidy5e") || sheetClasses.includes("tidy5e-sheet")) {
        addTogglePartyButtonTidy($html, sheet.actor);
        addGroupInventoryIndicatorTidy($html, sheet.actor);
    } else {
        addTogglePartyButton($html, sheet.actor);
    }
});

// Using the generic 'get' hook is safer than specific sheet hooks for headers
Hooks.on('getActorSheetHeaderButtons', (app, buttons) => {
    // Only add button for 5e characters
    if (!app.document || app.document.type !== 'character') return;

    buttons.unshift({
        class: 'open-party-inventory-button',
        icon: 'fa-solid fa-users', // Updated Icon
        label: game.i18n.localize(`${localizationID}.button-title`),
        onclick: () => {
            PartyInventory.activate();
        }
    });
});

Hooks.on('getSceneControlButtons', (controls) => {
    const groupName = game.settings.get(moduleId, 'controlButtonGroup');
    const group = controls.find((c) => c.name === groupName);
    
    if (group) {
        group.tools.push({
            name: moduleId,
            title: `${localizationID}.button-title`,
            icon: 'fa-solid fa-users', // Updated Icon
            visible: true,
            onClick: () => PartyInventory.activate(),
            button: true
        });
    }
});

/**
 * Optimized Hook: Only refresh if the item belongs to a Player Character.
 * Updating random NPC items shouldn't trigger a full UI refresh.
 */
function shouldRefresh(item) {
    return item.actor && item.actor.hasPlayerOwner;
}

Hooks.on('updateItem', (item) => {
    if (shouldRefresh(item)) PartyInventory.refresh();
});

Hooks.on('deleteItem', (item) => {
    if (shouldRefresh(item)) PartyInventory.refresh();
});

Hooks.on('createItem', (item) => {
    if (shouldRefresh(item)) PartyInventory.refresh();
});

Hooks.on('init', () => {
    game.modules.get(moduleId).api = {
        openWindow: () => { PartyInventory.activate(); }
    }
});
