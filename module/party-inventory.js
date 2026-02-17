import { moduleId, localizationID } from './const.js';
import { PartyInventory } from './apps/inventory.js';
import { SplitCurrency } from './apps/split-currency.js';

/* --- Initialization & Settings Registration --- */
Hooks.on('init', () => {
    game.modules.get(moduleId).api = {
        openWindow: () => { PartyInventory.activate(); }
    };

    // Initialize the Application instance
    game.partyInventory = new PartyInventory();

    // Start the UI Injector
    setInterval(universalSheetInjector, 800);
});

Hooks.on('setup', () => {
    const debouncedReload = foundry.utils.debounce(() => window.location.reload(), 100);

    // Settings Registration (Scratchpad, Currency, etc.)
    game.settings.register(moduleId, 'scratchpad', { 
        scope: 'world', 
        type: Array, 
        default: [], 
        onChange: () => game.partyInventory?.render() 
    });

    game.settings.register(moduleId, 'currency', { 
        scope: 'world', 
        type: Object, 
        default: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, 
        onChange: () => game.partyInventory?.render() 
    });

    game.settings.register(moduleId, 'excludedActors', { 
        scope: 'world', 
        type: Array, 
        default: [], 
        onChange: () => { 
            Object.values(ui.windows)
                .filter(w => w.id === `${moduleId}-split-currency`)
                .forEach(w => w.render()); 
        } 
    }); 

    game.settings.register(moduleId, 'controlButtonGroup', {
        name: `${localizationID}.setting-control-group`,
        scope: 'client', config: true, type: String, default: "token",
        choices: { "token": `${localizationID}.token-group`, "notes": `${localizationID}.notes-group` },
        onChange: debouncedReload
    });

    game.settings.register(moduleId, 'currencyNotifications', { scope: 'world', config: true, type: Boolean, default: true });
    game.settings.register(moduleId, 'deleteActorItemOnDrag', { scope: 'world', config: true, type: Boolean, default: true });
});

/* --- UI Injection: Sidebar & Header --- */

Hooks.on("getSceneControlButtons", (controls) => {
    // Robust check for V13 Map/Object structures + Plural naming
    const tokenLayer = controls.tokens || controls.token || 
                       (controls.get && controls.get("tokens")) || 
                       (controls.get && controls.get("token"));

    if (tokenLayer) {
        const tool = {
            name: "party-inventory",
            title: "PARTY-INVENTORY.button-title",
            icon: "fas fa-users",
            visible: true,
            button: true,
            onClick: () => game.partyInventory.render(true)
        };

        // Handle Object vs Array structure (V13 vs V12)
        if (Array.isArray(tokenLayer.tools)) {
            if (!tokenLayer.tools.some(t => t.name === "party-inventory")) {
                tokenLayer.tools.push(tool);
            }
        } else {
            // V13 Object Structure
            tokenLayer.tools["party-inventory"] = tool;
        }
    }
});

// Character Sheet Header Button
Hooks.on('getActorSheet5eCharacterHeaderButtons', (app, buttons) => {
    buttons.unshift({
        class: 'open-party-inventory-button',
        icon: 'fas fa-users',
        label: game.i18n.localize(`${localizationID}.button-title`),
        onclick: () => PartyInventory.activate()
    });
});

/* --- Universal Row Injector --- */
function universalSheetInjector() {
    const apps = Array.from(foundry.applications.instances.values());
    apps.forEach(app => {
        if (app.document?.type !== "character" || app.id?.includes("party-inventory")) return;

        const rows = app.element?.querySelectorAll('[data-item-id]:not(.pi-done)');
        if (!rows) return;

        rows.forEach(row => {
            const item = app.document.items.get(row.dataset.itemId);
            const validTypes = ["weapon", "equipment", "consumable", "tool", "loot", "backpack"];
            
            if (!item || !validTypes.includes(item.type)) {
                row.classList.add('pi-done');
                return;
            }

            const actionContainer = row.querySelector('.item-controls, .item-actions, .tidy-table-actions, .controls');
            if (!actionContainer) return;

            row.classList.add('pi-done');

            const isShared = item.getFlag(moduleId, "inPartyInventory");
            const myBtn = document.createElement("a");
            myBtn.innerHTML = '<i class="fas fa-users"></i>';
            
            myBtn.style.cssText = `margin-right: 10px; cursor: pointer; color: ${isShared ? "#ff6400" : "#999"}; font-size: 1.1em; display: inline-flex; align-items: center; vertical-align: middle;`;
            
            myBtn.onclick = async (e) => {
                e.preventDefault(); e.stopPropagation();
                const current = !!item.getFlag(moduleId, "inPartyInventory");
                await item.setFlag(moduleId, "inPartyInventory", !current);
                myBtn.style.color = !current ? "#ff6400" : "#999";
                PartyInventory.refresh();
            };

            actionContainer.prepend(myBtn);
        });
    });
}

Hooks.on('updateItem', () => PartyInventory.refresh());
Hooks.on('deleteItem', () => PartyInventory.refresh());
