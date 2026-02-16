import { moduleId } from './const.js';
// Ensure this path matches where you put the new semaphore.js
import { Mutex } from './semaphore.js'; 

export class Scratchpad {
    static mutex = new Mutex();

    static get items() {
        const scratchpad = game.settings.get(moduleId, 'scratchpad');
        // Safety check if order is missing
        return scratchpad.order?.map(id => scratchpad.items[id]).filter(i => i) || [];
    }

    static getItem(itemId) {
        const scratchpad = game.settings.get(moduleId, 'scratchpad');
        return scratchpad.items?.[itemId];
    }

    // --- Core Logic (GM Only) ---

    static async createItem(itemData, options = {}) {
        await this.mutex.use(async () => {
            const newItem = {
                ...itemData,
                id: foundry.utils.randomID(16)
            };
    
            // Clone settings to avoid reference issues
            let scratchpad = foundry.utils.deepClone(game.settings.get(moduleId, 'scratchpad') || {});
            
            // Initialization checks
            if (typeof scratchpad !== 'object' || Array.isArray(scratchpad)) scratchpad = {};
            if (!scratchpad.items || typeof scratchpad.items !== 'object') scratchpad.items = {};
            if (!Array.isArray(scratchpad.order)) scratchpad.order = [];
    
            scratchpad.items[newItem.id] = newItem;

            if (options.after && scratchpad.order.includes(options.after)) {
                const insertIndex = scratchpad.order.indexOf(options.after) + 1;
                scratchpad.order.splice(insertIndex, 0, newItem.id);
            } else {
                scratchpad.order.push(newItem.id);
            }
    
            await game.settings.set(moduleId, 'scratchpad', scratchpad);
        });
    }

    static async updateItem(itemId, itemData) {
        await this.mutex.use(async () => {
            let scratchpad = foundry.utils.deepClone(game.settings.get(moduleId, 'scratchpad'));
            if (!scratchpad.items[itemId]) return; // Item might have been deleted

            scratchpad.items[itemId] = foundry.utils.mergeObject(scratchpad.items[itemId], itemData);
            await game.settings.set(moduleId, 'scratchpad', scratchpad);
        });
    }

    static async deleteItem(itemId) {
        await this.mutex.use(async () => {
            let scratchpad = foundry.utils.deepClone(game.settings.get(moduleId, 'scratchpad'));
            
            if (scratchpad.items[itemId]) {
                delete scratchpad.items[itemId];
                scratchpad.order = scratchpad.order.filter(id => id !== itemId);
                await game.settings.set(moduleId, 'scratchpad', scratchpad);
            }
        });
    }

    static async reorderItem(movedItemId, targetItemId) {
        await this.mutex.use(async () => {
            let scratchpad = foundry.utils.deepClone(game.settings.get(moduleId, 'scratchpad'));
            
            const movedItemIndex = scratchpad.order.indexOf(movedItemId);
            const targetItemIndex = scratchpad.order.indexOf(targetItemId);

            if (movedItemIndex >= 0 && targetItemIndex >= 0 && movedItemIndex !== targetItemIndex) {
                // Remove moved item
                scratchpad.order.splice(movedItemIndex, 1);
                
                // Recalculate index after removal
                const newTargetIndex = scratchpad.order.indexOf(targetItemId);
                
                // Determine insertion point (place after target if moving down, before if moving up logic depends on UI, usually strictly before/after)
                // Standard logic: Insert at the index of the target (displacing it)
                const insertIndex = movedItemIndex > targetItemIndex ? newTargetIndex : newTargetIndex + 1;
                
                scratchpad.order.splice(insertIndex, 0, movedItemId);
                
                await game.settings.set(moduleId, 'scratchpad', scratchpad);
            }
        });
    }

    // --- Request Methods (Client -> GM) ---

    static requestCreate(itemData, options) {
        if (game.user.isGM) {
            this.createItem(itemData, options);
        } else {
            game.socket.emit(`module.${moduleId}`, {
                type: 'create',
                itemData,
                options
            });
        }
    }

    static requestUpdate(itemId, itemData) {
        if (game.user.isGM) {
            this.updateItem(itemId, itemData);
        } else {
            game.socket.emit(`module.${moduleId}`, {
                type: 'update',
                items: { [itemId]: itemData }
            });
        }
    }

    static requestDelete(itemId) {
        if (game.user.isGM) {
            this.deleteItem(itemId);
        } else {
            game.socket.emit(`module.${moduleId}`, {
                type: 'delete',
                items: [itemId]
            });
        }
    }

    static requestReorder(movedItemId, targetItemId) {
        if (game.user.isGM) {
            this.reorderItem(movedItemId, targetItemId);
        } else {
            game.socket.emit(`module.${moduleId}`, {
                type: 'reorder',
                items: [movedItemId, targetItemId]
            });
        }
    }
}

// --- Socket Listeners ---

Hooks.on('setup', () => {
    game.socket.on(`module.${moduleId}`, async (payload) => {
        // V13 Safety: Ensure payload exists
        if (!payload || !game.user.isGM) return;

        const { type, items, itemData, options } = payload;

        switch (type) {
            case 'create':
                await Scratchpad.createItem(itemData, options);
                break;
            case 'update':
                for (let id in items) {
                    await Scratchpad.updateItem(id, items[id]);
                }
                break;
            case 'delete':
                if (Array.isArray(items)) {
                    for (const id of items) await Scratchpad.deleteItem(id);
                }
                break;
            case 'reorder':
                if (Array.isArray(items) && items.length === 2) {
                    await Scratchpad.reorderItem(items[0], items[1]);
                }
                break;
        }
    });
});

// --- Item Creation Hook ---
// Deletes from scratchpad if dragged onto a real character sheet
Hooks.on('createItem', async (item) => {
    if (!game.user.isGM) return;
    
    // Check flags for origin
    const originId = item.getFlag(moduleId, 'scratchpadId');
    if (originId) {
        await Scratchpad.deleteItem(originId);
    }
});

// --- D&D 5e Specific Hook for Consumables Stacking ---
Hooks.on('setup', () => {
    // We wrap this in a try-catch or strict check because system internals change often
    const system = game.system.id;
    if (system !== 'dnd5e') return;

    // Wait until init to ensure classes are loaded
    Hooks.once('init', () => {
        const ActorSheet = game.dnd5e?.applications?.actor?.ActorSheet5eCharacter;
        if (!ActorSheet) return;

        const proto = Object.getPrototypeOf(ActorSheet).prototype;
        const originalDrop = proto._onDropStackConsumables;

        if (originalDrop) {
            proto._onDropStackConsumables = async function(itemData) {
                const scratchpadId = itemData.flags?.[moduleId]?.scratchpadId;
                
                // Call original logic
                const result = await originalDrop.apply(this, [itemData]);

                // If successful drop from scratchpad, request deletion
                if (result && scratchpadId) {
                    Scratchpad.requestDelete(scratchpadId);
                }

                return result;
            };
        }
    });
});
