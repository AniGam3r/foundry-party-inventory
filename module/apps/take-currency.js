import { moduleId, localizationID } from '../const.js';
import { Currency } from '../currency.js';

// Import V13 ApplicationV2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TakeCurrency extends HandlebarsApplicationMixin(ApplicationV2) {
    
    static DEFAULT_OPTIONS = {
        id: `${moduleId}-take-currency`,
        tag: "form",
        classes: ["sheet", "party-inventory-take"],
        window: {
            title: `${localizationID}.take-currency`,
            resizable: false,
            icon: "fa-solid fa-hand-holding-dollar", // Added V13 icon
            controls: []
        },
        position: {
            width: 420,
            height: "auto" // 'auto' is safer than fixed pixels in V13
        },
        form: {
            handler: TakeCurrency.#onSubmit,
            closeOnSubmit: true,
            submitOnChange: false
        }
    };

    /**
     * Even though we don't pass data, _prepareContext is required
     * by the HandlebarsMixin.
     */
    async _prepareContext(options) {
        return {};
    }

    /**
     * Handle DOM manipulation after rendering.
     * Replaces activateListeners().
     */
    _onRender(context, options) {
        const html = this.element;

        // Auto-focus logic:
        // In V13, we check if the active element is already inside our form.
        // If not, we focus the Platinum (pp) input.
        if (!html.contains(document.activeElement)) {
            const ppInput = html.querySelector("[name='currency.pp']");
            if (ppInput) ppInput.focus();
        }
    }

    /**
     * Handle form submission.
     * Replaces _updateObject().
     */
    static async #onSubmit(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);
        
        // V13 Safety Check: Ensure the user actually has a character assigned
        const characterId = game.user.character?.id;

        if (!characterId) {
            ui.notifications.warn(game.i18n.localize("PARTY-INVENTORY.no-character-assigned"));
            return;
        }

        if (data.currency) {
            Currency.requestTake(data.currency, characterId);
        }
    }
}
