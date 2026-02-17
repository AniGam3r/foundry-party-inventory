import { localizationID, moduleId } from './const.js';
// Ensure this path matches where you saved the new semaphore.js
import { Mutex } from './dependencies/semaphore.js'; 

export class Currency {
    // Initialize the V13-compatible Mutex
    static mutex = new Mutex();

    static get values() {
        return game.settings.get(moduleId, 'currency');
    }

    static set values(newValues) {
        game.settings.set(moduleId, 'currency', newValues);
    }

    static get actorInfo() {
        // V13 Safety: Ensure we only get real actors
        const actors = game.actors.filter(a => a.hasPlayerOwner);
        const excluded = game.settings.get(moduleId, 'excludedActors') || [];

        return actors.map(a => {
            return {
                actor: a,
                isIncluded: !excluded.includes(a.id)
            }
        })
    }

    static updateActorState(actorId, state) {
        let excluded = game.settings.get(moduleId, 'excludedActors') || [];
        excluded = excluded.filter(i => i !== actorId);

        if (state) {
            excluded.push(actorId); // "state" here implies "exclude this actor"
        }

        game.settings.set(moduleId, 'excludedActors', excluded);
    }

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

    static requestTake(currency, actorId) {
        if (game.user.isGM) {
            this.handleTransfer({ currency, actorId });
        } else {
            game.socket.emit(`module.${moduleId}`, {
                type: 'transfer-currency',
                transfer: {
                    currency,
                    actorId
                }
            });
        }
    }

    static requestActorState(actorId, state) {
        if (game.user.isGM) {
            this.updateActorState(actorId, state);
        } else {
            game.socket.emit(`module.${moduleId}`, {
                type: 'update-actor-state',
                transfer: {
                    actorId,
                    state
                }
            });
        }
    }

    static async handleTransfer(transfer) {
        // Use the modern 'use' method from our new Mutex class.
        // This automatically handles 'acquire' and 'release' safely.
        await this.mutex.use(async () => {
            const actor = game.actors.get(transfer.actorId);
            if (!actor) return; // Safety check

            // V13 UPDATE: Access system data via .system, not .data
            const currentCurrency = actor.system.currency;
            const transferCurrency = transfer.currency;
            const actorUpdate = {};
            
            // Clone the party currency to avoid direct mutation issues
            const partyCurrency = foundry.utils.deepClone(this.values);
            const message = [];
    
            for (let currency in currentCurrency) {
                // Ensure we are working with valid numbers
                const transferAmount = transferCurrency[currency];
                
                if (Number.isInteger(transferAmount) && transferAmount !== 0) {
                    // Update Actor side
                    actorUpdate[currency] = (currentCurrency[currency] || 0) + transferAmount;
                    
                    // Update Party side
                    partyCurrency[currency] = (partyCurrency[currency] || 0) - transferAmount;
                    
                    message.push(`${transferAmount} ${game.i18n.localize(`${localizationID}.${currency}`)}`);
                }
            }
    
            // V13 CRITICAL FIX: Use 'system.currency' instead of 'data.currency'
            if (!foundry.utils.isEmpty(actorUpdate)) {
                await actor.update({ 'system.currency': actorUpdate });
            }
            
            await game.settings.set(moduleId, 'currency', partyCurrency);
    
            // Notifications logic
            if (game.settings.get(moduleId, 'currencyNotifications') && message.length) {
                const notificationMessage = game.i18n.format(`${localizationID}.took-currency-notification`, {
                    name: actor.name,
                    currency: message.join(', ')
                });

                // Emit to other clients
                game.socket.emit(`module.${moduleId}`, {
                    type: 'notify-transfer',
                    transfer: notificationMessage
                });
                
                // Show to GM (self)
                ui.notifications.info(notificationMessage);
            }
        });
    }
}

/**
 * Socket Listeners
 * Kept outside the class to ensure they register early.
 */
Hooks.on('setup', () => {
    game.socket.on(`module.${moduleId}`, (packet) => {
        const { type, transfer } = packet;

        // Only the GM processes logic events
        if (game.user.isGM) {
            switch (type) {
                case 'update-currency':
                    Currency.values = transfer;
                    break;
                case 'transfer-currency':
                    Currency.handleTransfer(transfer);
                    break;
                case 'update-actor-state':
                    Currency.updateActorState(transfer.actorId, transfer.state);
                    break;
            }
        }

        // All users process notifications
        if (type === 'notify-transfer') {
            ui.notifications.info(transfer);
        }
    });
});
