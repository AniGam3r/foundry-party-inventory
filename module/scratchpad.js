import { moduleId } from './const.js';
import { Mutex } from './dependencies/semaphore.js'; 

export class Scratchpad {
    static mutex = new Mutex();

    /**
     * Pulls the items from the setting. 
     * If it finds the old object format, it returns an empty array to prevent crashes 
     * until the migration script is run.
     */
    static get items() {
        const data = game.settings.get(moduleId, 'scratchpad');
        return Array.isArray(data) ? data : [];
    }

    static getItem(itemId) {
        return this.items.find(i => (i.id === itemId || i._id === itemId));
    }

    // --- GM Core Logic ---

    static async createItem(itemData, options = {}) {
        await this.mutex.use(async () => {
            const newItem = {
                ...itemData,
                id: itemData.id || foundry.utils.randomID(16)
            };
    
            const items = [...this.items];
            items.push(newItem);
    
            await game.settings.set(moduleId, 'scratchpad', items);
        });
    }

    static async updateItem(itemId, itemData) {
        await this.mutex.use(async () => {
            const items = [...this.items];
            const index = items.findIndex(i => (i.id === itemId || i._id === itemId));
            if (index === -1) return;

            items[index] = foundry.utils.mergeObject(items[index], itemData);
            await game.settings.set(moduleId, 'scratchpad', items);
        });
    }

    static async deleteItem(itemId) {
        await this.mutex.use(async () => {
            const items = this.items.filter(i => (i.id !== itemId && i._id !== itemId));
            await game.settings.set(moduleId, 'scratchpad', items);
        });
    }

    // --- Client Requests ---

    static requestCreate(itemData, options) {
        if (game.user.isGM) this.createItem(itemData, options);
        else game.socket.emit(`module.${moduleId}`, { type: 'create', itemData, options });
    }

    static requestUpdate(itemId, itemData) {
        if (game.user.isGM) this.updateItem(itemId, itemData);
        else game.socket.emit(`module.${moduleId}`, { type: 'update', items: { [itemId]: itemData } });
    }

    static requestDelete(itemId) {
        if (game.user.isGM) this.deleteItem(itemId);
        else game.socket.emit(`module.${moduleId}`, { type: 'delete', items: [itemId] });
    }
}

// --- Listeners ---

Hooks.on('setup', () => {
    game.socket.on(`module.${moduleId}`, async (payload) => {
        if (!payload || !game.user.isGM) return;
        const { type, items, itemData, options } = payload;
        switch (type) {
            case 'create': await Scratchpad.createItem(itemData, options); break;
            case 'update': for (let id in items) await Scratchpad.updateItem(id, items[id]); break;
            case 'delete': if (Array.isArray(items)) { for (const id of items) await Scratchpad.deleteItem(id); } break;
        }
    });
});

Hooks.on('createItem', async (item) => {
    if (!game.user.isGM) return;
    const originId = item.getFlag(moduleId, 'scratchpadId');
    if (originId) await Scratchpad.deleteItem(originId);
});
