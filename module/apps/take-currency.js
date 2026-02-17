import { moduleId, localizationID } from '../const.js';
import { Currency } from '../currency.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TakeCurrency extends HandlebarsApplicationMixin(ApplicationV2) {
    
    static DEFAULT_OPTIONS = {
        id: `${moduleId}-take-currency`,
        tag: "form",
        classes: ["sheet", "party-inventory-take"],
        window: {
            title: `${localizationID}.take-currency`,
            resizable: false,
            icon: "fa-solid fa-hand-holding-dollar",
            controls: []
        },
        position: {
            width: 420,
            height: "auto"
        },
        form: {
            handler: TakeCurrency.#onSubmit,
            closeOnSubmit: true,
            submitOnChange: false
        }
    };

    static PARTS = {
        form: {
            template: `modules/${moduleId}/templates/take-currency.hbs`
        }
    };

    async _prepareContext(options) {
        const actors = game.actors.filter(a => a.type === "character" && a.isOwner);
        return {
            actors: actors.map(a => ({ id: a.id, name: a.name })),
            localizationID: localizationID
        };
    }

    _onRender(context, options) {
        const html = this.element;
        const firstInput = html.querySelector("input[type='number']");
        if (firstInput) firstInput.focus();
    }

    static async #onSubmit(event, form, formData) {
    event.preventDefault(); 

    // Get the data from the V13 formData object
    const data = foundry.utils.expandObject(formData.object);
    
    const actorId = data.actorId;
    const actor = game.actors.get(actorId);

    if (!actor) return ui.notifications.warn("No actor selected.");

    // Process the money move
    if (data.currency) {
        await Currency.requestTake(data.currency, actor.id);
    }

    // Since we handled everything, let the window close
    // closeOnSubmit: true in DEFAULT_OPTIONS handles this automatically
}
}
