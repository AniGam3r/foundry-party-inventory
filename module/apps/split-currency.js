import { moduleId, localizationID } from '../const.js';
import { Currency } from '../currency.js';

// Import the V13 ApplicationV2 classes
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SplitCurrency extends HandlebarsApplicationMixin(ApplicationV2) {
    
    // Private field to track local UI state
    #showNonSplitting = false;

    static DEFAULT_OPTIONS = {
        id: `${moduleId}-split-currency`,
        tag: "form",
        classes: ["sheet", "party-inventory-split"],
        window: {
            title: `${localizationID}.split-currency`,
            resizable: true,
            icon: "fa-solid fa-coins", // Added V13 icon
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

    /**
     * Prepare data for the Handlebars template.
     * Replaces the old getData() method.
     */
    async _prepareContext(options) {
        const actorInfo = Currency.actorInfo;
        const actors = actorInfo.filter(i => i.isIncluded).map(i => i.actor);
        const nonSplittingActors = actorInfo.filter(i => !i.isIncluded).map(i => i.actor);

        const stash = Currency.values;
        const values = {};
        
        // Prevent division by zero if no actors are selected
        const divisor = actors.length || 1;

        for (let currency in stash) {
            values[currency] = Math.floor(stash[currency] / divisor);
        }

        // Map actors to a cleaner object structure for the template
        const actorData = actors.map(a => {
            return {
                name: a.name,
                id: a.id,
                currency: { ...values }
            };
        });

        return { 
            actors: actorData,
            nonSplittingActors,
            showNonSplitting: this.#showNonSplitting
        };
    }

    /**
     * Attach event listeners to the DOM.
     * Replaces activateListeners() and removes jQuery dependencies.
     */
    _onRender(context, options) {
        const html = this.element;

        // Handle the "Reveal Disabled" button
        const revealBtn = html.querySelector('[data-action="reveal-disabled"]');
        if (revealBtn) {
            revealBtn.addEventListener('click', (event) => {
                event.preventDefault();
                this.#showNonSplitting = true;
                this.render(); // Re-render to show the hidden section
            });
        }

        // Handle Actor Inclusion Checkboxes
        const checkboxes = html.querySelectorAll('.party-inventory__actor-included');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (event) => {
                const actorId = event.target.dataset.actorId;
                // Preserving original logic: passing !checked
                Currency.requestActorState(actorId, !event.target.checked);
            });
        });
    }

    /**
     * Handle form submission.
     * Replaces _updateObject().
     */
    static async #onSubmit(event, form, formData) {
        // Expand the flat FormData into a nested object
        const data = foundry.utils.expandObject(formData.object);
        
        // Iterate over actors and request the currency take
        if (data.actors) {
            for (let [actorId, currencyData] of Object.entries(data.actors)) {
                Currency.requestTake(currencyData, actorId);
            }
        }
    }
}
