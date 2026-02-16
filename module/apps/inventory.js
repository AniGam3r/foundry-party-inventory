import { moduleId, localizationID } from '../const.js';
import { Currency } from '../currency.js';
import { Scratchpad } from '../scratchpad.js';
import { SplitCurrency } from './split-currency.js';
import { TakeCurrency } from './take-currency.js';

// We switch to the modern ApplicationV2 base
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PartyInventory extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options = {}) {
        super(options);
        this._items = [];
    }

    static DEFAULT_OPTIONS = {
        id: moduleId,
        classes: ["dnd5e", "sheet", "actor", "party-inventory-v13"],
        tag: "form",
        window: {
            title: `${localizationID}.window-title`,
            resizable: true,
            controls: []
        },
        position: {
            width: 600,
            height: 500,
        },
        // In AppV2, we define "parts" of the template
        renderConfig: {
            template: `modules/${moduleId}/templates/party-inventory.hbs`,
        },
        form: {
            handler: PartyInventory.#onSubmit,
            submitOnChange: true,
            closeOnSubmit: false
        },
        dragDrop: [{ dragSelector: ".scratchpad .item", dropSelector: null }]
    };

    static instance = null;

    /**
     * Proper singleton management for V13
     */
    static activate() {
        this.instance ??= new PartyInventory();
        this.instance.render(true);
    }

    /**
     * V13 replacement for refresh()
     * ApplicationV2 maintains focus automatically during re-renders.
     */
    static async refresh() {
        if (this.instance) {
            await this.instance.render({ force: false });
        }
    }

    /**
     * Prepare data for the Handlebars template
     */
    async _prepareContext(options) {
        const items = game.actors
            .filter(a => a.hasPlayerOwner)
            .flatMap(a => a.items.contents)
            .filter(i => i.getFlag(moduleId, 'inPartyInventory'));

        items.sort((a, b) => a.name.localeCompare(b.name));
        this._items = items;

        const processedItems = items.map(i => {
            const obj = i.toObject(); // Standardize data
            obj.isStack = (i.system?.quantity ?? 1) > 1;
            obj.charName = i.actor.name.split(' ')[0];
            return obj;
        });

        const scratchpadItems = foundry.utils.deepClone(Scratchpad.items).map(i => {
            const qr = this.detectQuantity(i.name);
            return {
                ...i,
                quantity: qr.quantity > 1 ? qr.quantity : null,
                hasFootnote: qr.quantity > 1 || !!i.sourceData
            };
        });

        return {
            items: processedItems,
            typeLabels: CONFIG.Item.typeLabels,
            scratchpadItems,
            currency: Currency.values,
            isGM: game.user.isGM
        };
    }

    /**
     * The modern way to handle form submission
     */
    static async #onSubmit(event, form, formData) {
        const data = foundry.utils.expandObject(formData.object);
        
        // Handle Scratchpad updates
        if (data.scratchpad) {
            for (let [id, update] of Object.entries(data.scratchpad)) {
                const existing = Scratchpad.getItem(id);
                const diff = foundry.utils.diffObject(existing, update);
                if (!foundry.utils.isEmpty(diff)) {
                    Scratchpad.requestUpdate(id, diff);
                }
            }
        }

        // Handle Currency updates
        if (data.currency) {
            Currency.requestUpdate(data.currency);
        }
    }

    /**
     * Use native JS event delegation instead of jQuery .on()
     */
    _onRender(context, options) {
        const html = this.element;

        // Button Actions
        html.querySelectorAll("[data-action]").forEach(el => {
            el.addEventListener("click", this.#handleAction.bind(this));
        });

        // Image Editing
        html.querySelectorAll("img[data-edit]").forEach(img => {
            img.addEventListener("click", ev => this._onEditImage(ev));
        });

        // Item Summary Toggles
        html.querySelectorAll("h4").forEach(h4 => {
            h4.addEventListener("click", ev => this._onItemSummary(ev));
        });

        // Handle FilePicker-less users (Icon Picker module)
        this.#setupIconPicker(html);
    }

    async #handleAction(event) {
        const action = event.currentTarget.dataset.action;
        const itemId = event.target.closest('[data-item-id]')?.dataset.itemId;
        const item = Scratchpad.getItem(itemId);

        switch (action) {
            case 'create':
                Scratchpad.requestCreate({ img: "icons/svg/item-bag.svg" });
                break;
            case 'delete':
                Scratchpad.requestDelete(itemId);
                break;
            case 'collapse':
                Scratchpad.requestUpdate(itemId, { isCollapsed: !item.isCollapsed });
                break;
            case 'take-currency':
                new TakeCurrency().render(true);
                break;
            case 'split-currency':
                new SplitCurrency().render(true);
                break;
        }
    }

    // ... (detectQuantity and splitItem logic remain as helper methods) ...

    /**
     * Drag and Drop in ApplicationV2
     */
    _onDragStart(event) {
        const li = event.currentTarget;
        const itemId = li.dataset.itemId;
        const data = this._constructExportableData(itemId);

        event.dataTransfer.setData("text/plain", JSON.stringify({
            type: "Item",
            data: data
        }));
    }

    async _onDrop(event) {
        const data = TextEditor.getDragEventData(event); // V13 standard for drag data
        if (!data || data.type !== "Item") return;

        // Logic for createFromData remains essentially the same but using toObject()
        // ... (rest of drop logic)
    }
}
