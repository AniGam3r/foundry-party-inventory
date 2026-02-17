import { localizationID, moduleId } from './const.js';
import { Mutex } from './dependencies/semaphore.js'; 

export class Currency {
    static mutex = new Mutex();

    /**
     * Get the current stash values from settings.
     */
    static get values() {
        return game.settings.get(moduleId, 'currency') || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
    }

    /**
     * Directly set the stash values.
     */
    static set values(newValues) {
        game.settings.set(moduleId, 'currency', newValues);
    }

    /**
     * Returns a list of actors eligible for splitting/taking.
     * Includes player-owned characters AND GM-owned characters.
     */
    static get actorInfo() {
        const actors = game.actors.filter(a => a.type === "character" && (a.hasPlayerOwner || a.isOwner));
        const excluded = game.settings.get(moduleId, 'excludedActors') || [];

        return actors.map(a => {
            return {
                actor: a,
                isIncluded: !excluded.includes(a.id)
            }
        });
    }

    /**
     * Updates the excluded/included state for the split-currency UI.
     */
    static updateActorState(actorId, state) {
        let excluded = game.settings.get(moduleId, 'excludedActors') || [];
        excluded = excluded.filter(i => i !== actorId);

        if (state) {
            excluded.push(actorId); 
        }

        game.settings.set(moduleId, 'excludedActors', excluded);
    }

    /**
     * Handles a simple raw update of the stash.
     */
    static requestUpdate(currency) {
        if (game.user.isGM) {
            Currency.values = currency;
        } else {
            game.socket.emit(`module.${moduleId}`, {
                type: 'update-currency',
                transfer: currency
            });
        }
    }

    /**
     * Called by the Take Currency window.
     * Moves money FROM the Party Stash TO the selected Actor.
     */
    static requestTake(currency, actorId) {
        if (game.user.isGM) {
            this.handleTransfer({ currency, actorId });
        } else {
            game.socket.emit(`module.${moduleId}`, {
                type: 'transfer-currency',
                transfer: { currency, actorId }
            });
        }
    }

    /**
     * Called by the Split Currency window.
     */
    static requestActorState(actorId, state) {
        if (game.user.isGM) {
            this.updateActorState(actorId, state);
        } else {
            game.socket.emit(`module.${moduleId}`, {
                type: 'update-actor-state',
                transfer: { actorId, state }
            });
        }
    }

    /**
     * The core logic for moving money between the stash and actors.
     * Math Logic: 
     * - Subtract from Party Stash
     * - Add to Actor Sheet
     */
    static async handleTransfer(transfer) {
        try {
            await this.mutex.use(async () => {
                const actor = game.actors.get(transfer.actorId);
                if (!actor) return;

                const currentActorCurrency = foundry.utils.deepClone(actor.system.currency);
                const transferRequest = transfer.currency;
                const partyStash = foundry.utils.deepClone(this.values);
                const actorUpdate = {};
                const message = [];
        
                for (let key in partyStash) {
                    const amountToMove = Number(transferRequest[key]) || 0;
                    if (amountToMove === 0) continue;

                    // 1. Calculate new Actor value (Current + Taken)
                    actorUpdate[key] = (currentActorCurrency[key] || 0) + amountToMove;
                    
                    // 2. Calculate new Party Stash value (Stash - Taken)
                    partyStash[key] = Math.max(0, (partyStash[key] || 0) - amountToMove);
                    
                    message.push(`${amountToMove}${key}`);
                }
        
                // Update the Actor Sheet
                if (!foundry.utils.isEmpty(actorUpdate)) {
                    await actor.update({ 'system.currency': actorUpdate });
                }
                
                // Update the Global Setting (Stash)
                // This triggers the UI refresh via the setting's onChange listener
                await game.settings.set(moduleId, 'currency', partyStash);
        
                // Notifications
                if (game.settings.get(moduleId, 'currencyNotifications') && message.length) {
                    const notificationMessage = game.i18n.format(`${localizationID}.took-currency-notification`, {
                        name: actor.name,
                        currency: message.join(', ')
                    });

                    game.socket.emit(`module.${moduleId}`, {
                        type: 'notify-transfer',
                        transfer: notificationMessage
                    });
                    
                    ui.notifications.info(notificationMessage);
                }
            });
        } catch (err) {
            console.error("Party Inventory | Transfer Error:", err);
        }
    }
}

// --- Socket Listeners ---

Hooks.on('setup', () => {
    game.socket.on(`module.${moduleId}`, (packet) => {
        const { type, transfer } = packet;
        if (game.user.isGM) {
            switch (type) {
                case 'update-currency': Currency.values = transfer; break;
                case 'transfer-currency': Currency.handleTransfer(transfer); break;
                case 'update-actor-state': Currency.updateActorState(transfer.actorId, transfer.state); break;
            }
        }
        if (type === 'notify-transfer') {
            ui.notifications.info(transfer);
        }
    });
});
