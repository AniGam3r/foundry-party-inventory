import { moduleId, localizationID } from '../const.js';
import { Currency } from '../currency.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SplitCurrency extends HandlebarsApplicationMixin(ApplicationV2) {
    
    #showNonSplitting = false;

    static DEFAULT_OPTIONS = {
        id: `${moduleId}-split-currency`,
        tag: "form",
        classes: ["sheet", "party-inventory-split"],
        window: {
            title: `${localizationID}.split-currency`,
            resizable: true,
            icon: "fa-solid fa-coins",
            controls: []
        },
        position: {
            width: 550,
            height: "auto"
        },
        form: {
            handler: SplitCurrency.#onSubmit,
            closeOnSubmit: true,
            submitOnChange: false
        }
    };

    static PARTS = {
        form: {
            template: `modules/${moduleId}/templates/split-currency.hbs`
        }
    };

    async _prepareContext(options) {
        // IMPROVED: Find characters that are player-owned OR owned by you (the GM)
        const excludedIds = game.settings.get(moduleId, 'excludedActors') || [];
        
        const allEligible = game.actors.filter(a => 
            a.type === "character" && 
            (a.hasPlayerOwner || a.isOwner)
        );

        const actors = allEligible.filter(a => !excludedIds.includes(a.id));
        const nonSplittingActors = allEligible.filter(a => excludedIds.includes(a.id));

        const stash = game.settings.get(moduleId, 'currency') || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
        const perActorValues = {};
        const divisor = actors.length || 1;

        // Calculate the even split
        for (let denom in stash) {
            perActorValues[denom] = Math.floor(stash[denom] / divisor);
        }

        const actorData = actors.map(a => ({
            name: a.name,
            id: a.id,
            currency: { ...perActorValues }
        }));

        return { 
            actors: actorData,
            nonSplittingActors,
            showNonSplitting: this.#showNonSplitting,
            localizationID: localizationID
        };
    }

    _onRender(context, options) {
        const html = this.element;

        // Toggle hidden actors
        html.querySelector('[data-action="reveal-disabled"]')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.#showNonSplitting = true;
            this.render(); 
        });

        // Toggle inclusion state
        html.querySelectorAll('.party-inventory__actor-included').forEach(checkbox => {
            checkbox.addEventListener('change', async (event) => {
                const actorId = event.target.dataset.actorId;
                let excluded = game.settings.get(moduleId, 'excludedActors') || [];
                
                if (event.target.checked) {
                    excluded = excluded.filter(id => id !== actorId);
                } else {
                    if (!excluded.includes(actorId)) excluded.push(actorId);
                }
                
                await game.settings.set(moduleId, 'excludedActors', excluded);
                this.render();
            });
        });
    }

    static async #onSubmit(event, form, formData) {
        // --- THE FIX ---
        // This prevents the browser from refreshing the game window
        event.preventDefault(); 

        const data = foundry.utils.expandObject(formData.object);
        
        if (data.actors) {
            const totalToSubtract = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

            for (let [actorId, currencies] of Object.entries(data.actors)) {
                const actor = game.actors.get(actorId);
                if (!actor) continue;

                const actorUpdates = {};
                for (let [denom, amount] of Object.entries(currencies)) {
                    const val = Number(amount) || 0;
                    if (val <= 0) continue;

                    const current = foundry.utils.getProperty(actor, `system.currency.${denom}`) || 0;
                    actorUpdates[`system.currency.${denom}`] = current + val;
                    totalToSubtract[denom] += val;
                }
                await actor.update(actorUpdates);
            }

            const stash = game.settings.get(moduleId, 'currency');
            const newStash = {};
            for (let denom in stash) {
                newStash[denom] = Math.max(0, stash[denom] - totalToSubtract[denom]);
            }
            
            // This update triggers the UI refresh via your setup hook
            await game.settings.set(moduleId, 'currency', newStash);
            
            ui.notifications.info("Currency split and distributed.");
        }
    }
}
