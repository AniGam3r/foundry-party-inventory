import { moduleId, localizationID } from '../const.js';
import { Currency } from '../currency.js';
import { Scratchpad } from '../scratchpad.js';
import { SplitCurrency } from './split-currency.js';
import { TakeCurrency } from './take-currency.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PartyInventory extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options = {}) {
        super(options);
        this._items = [];

        // --- DRAG & DROP HANDLERS ---
        this.dragDrop = new DragDrop({
            dragSelector: ".scratchpad .item",
            dropSelector: ".party-inventory-v13",
            permissions: { dragstart: () => true, drop: () => true },
            callbacks: { 
                dragstart: this._onDragStart.bind(this), 
                drop: this._onDrop.bind(this) 
            }
        });
    }

    static DEFAULT_OPTIONS = {
        id: moduleId,
        classes: ["dnd5e", "sheet", "actor", "party-inventory"],
        tag: "form",
        window: {
            title: `${localizationID}.window-title`,
            resizable: true,
            controls: [],
            icon: "fa-solid fa-boxes-stacked"
        },
        position: {
            width: 600,
            height: 500,
        },
        form: {
            handler: PartyInventory.#onSubmit,
            submitOnChange: true,
            closeOnSubmit: false
        }
    };

    static PARTS = {
        form: {
            template: `modules/${moduleId}/templates/party-inventory.hbs`
        }
    };

    static instance = null;

    static activate() {
        this.instance ??= new PartyInventory();
        this.instance.render(true);
    }

    static async refresh() {
        if (this.instance) {
            await this.instance.render({ force: false });
        }
    }

    async _onDrop(event) {
        event.preventDefault();

        // 1. Decode data
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch (err) {
            return;
        }
        
        if (data.type !== "Item") return;

        // 2. Get the item
        const item = await Item.fromDropData(data);
        if (!item) return;

        const itemSource = item.toObject();
        
        // 3. CLEAN DESCRIPTION (Strip <p> tags)
        let rawDesc = itemSource.system.description?.value || "";
        let tempDiv = document.createElement("div");
        tempDiv.innerHTML = rawDesc;
        let cleanDesc = tempDiv.innerText || tempDiv.textContent || "";

        // 4. Determine Name & Quantity
        const quantity = itemSource.system.quantity || 1;
        const displayName = quantity > 1 ? `${quantity} ${itemSource.name}` : itemSource.name;

        // 5. Create Entry
        await Scratchpad.requestCreate({
            type: itemSource.type,
            name: displayName,
            img: itemSource.img,
            description: cleanDesc,
            sourceData: itemSource
        });

        ui.notifications.info(`${itemSource.name} added to distribution list.`);

        // 6. Delete from actor if enabled
        if (game.settings.get(moduleId, 'deleteActorItemOnDrag') && item.actor) {
            if (item.actor.isOwner) await item.delete();
        }
    }

    _onDragStart(event) {
        const li = event.currentTarget;
        const itemId = li.dataset.itemId;
        const data = this._constructExportableData(itemId);
        
        if (data) {
            event.dataTransfer.setData("text/plain", JSON.stringify({
                type: "Item",
                data: data
            }));
        }
    }

    async _prepareContext(options) {
        const items = game.actors
            .filter(a => a.type === "character" && (a.hasPlayerOwner || a.isOwner))
            .flatMap(a => a.items.contents)
            .filter(i => i.getFlag(moduleId, 'inPartyInventory'));

        items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        this._items = items;

        const processedItems = items.map(i => {
            const obj = i.toObject();
            obj.isStack = (i.system?.quantity ?? 1) > 1;
            obj.charName = (i.actor?.name || "Unknown").split(' ')[0];
            obj._id = i.id; 
            return obj;
        });

        const scratchpadRaw = game.settings.get(moduleId, 'scratchpad') || [];
        
        const scratchpadItems = scratchpadRaw.map(i => {
            const itemName = i.name || "Unnamed Item";
            const qr = this.detectQuantity(itemName);
            return {
                ...i,
                name: itemName,
                quantity: qr.quantity > 1 ? qr.quantity : null,
                hasFootnote: qr.quantity > 1 || !!i.sourceData
            };
        });

        return {
            items: processedItems,
            typeLabels: CONFIG.Item.typeLabels,
            scratchpadItems: scratchpadItems,
            currency: { ...(game.settings.get(moduleId, 'currency') || {pp:0, gp:0, ep:0, sp:0, cp:0}) },
            isGM: game.user.isGM,
            localizationID: localizationID
        };
    }

    static async #onSubmit(event, form, formData) {
        event.preventDefault();
        const data = foundry.utils.expandObject(formData.object);
        
        if (data.scratchpad) {
            for (let [id, update] of Object.entries(data.scratchpad)) {
                const existing = Scratchpad.getItem(id);
                if (!existing) continue;
                const diff = foundry.utils.diffObject(existing, update);
                if (!foundry.utils.isEmpty(diff)) {
                    Scratchpad.requestUpdate(id, diff);
                }
            }
        }
        if (data.currency) {
            Currency.requestUpdate(data.currency);
        }
    }

    _onRender(context, options) {
        const html = this.element;

        // Activate DragDrop
        this.dragDrop.bind(html);

        // Listeners
        html.querySelectorAll("[data-action]").forEach(el => {
            el.addEventListener("click", this.#handleAction.bind(this));
        });

        html.querySelectorAll("img[data-edit]").forEach(img => {
            img.addEventListener("click", ev => this._onEditImage(ev));
        });

        html.querySelectorAll("h4").forEach(h4 => {
            h4.addEventListener("click", ev => this._onItemSummary(ev));
        });

        html.querySelectorAll('.item[data-item-id]').forEach(el => {
            const itemId = el.dataset.itemId;
            const item = Scratchpad.getItem(itemId);

            if (item?.sourceData) {
                const infoIcon = el.querySelector('.fa-info-circle');
                if (infoIcon) {
                    el.removeAttribute('title');
                    el.removeAttribute('data-tooltip');
                    
                    infoIcon.style.cursor = "pointer";
                    infoIcon.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        const tempItem = new game.dnd5e.documents.Item5e(item.sourceData);
                        tempItem.sheet.render(true, { editable: false });
                    });
                }
            }
        });
    }

    async #handleAction(event) {
        const action = event.currentTarget.dataset.action;
        const itemId = event.target.closest('[data-item-id]')?.dataset.itemId;
        
        switch (action) {
            case 'create':
                Scratchpad.requestCreate({ img: "icons/svg/item-bag.svg", name: "New Item" });
                break;
            case 'delete':
                Scratchpad.requestDelete(itemId);
                break;
            case 'take-currency':
                new TakeCurrency().render(true);
                break;
            case 'split-currency':
                new SplitCurrency().render(true);
                break;
            case 'split':
                const item = Scratchpad.getItem(itemId);
                if (item) this.#splitItemLogic(item, itemId);
                break;
            // NEW: Transfer case
            case 'transfer':
                this.#transferItemLogic(itemId);
                break;
        }
    }

    // NEW: Transfer logic
    async #transferItemLogic(itemId) {
        const item = Scratchpad.getItem(itemId);
        if (!item) return;

        // 1. Get eligible actors
        const actors = game.actors.filter(a => a.hasPlayerOwner && a.type === "character");
        if (actors.length === 0) return ui.notifications.warn("No player characters found.");

        // 2. Build Dialog
        const options = actors.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
        
        new Dialog({
            title: `Transfer Item`,
            content: `
                <div class="form-group">
                    <label style="font-weight:bold;">Transfer "${item.name}" to:</label>
                    <select id="transfer-target" style="width:100%">${options}</select>
                </div>
                <p style="margin-top:10px;">
                    <label><input type="checkbox" id="mark-shared" checked> Keep as Party Item (Shared)</label>
                </p>
                <p class="notes" style="font-size:0.9em; color:#666;">
                    Checked: Item moves to player but stays visible in Party Inventory.<br>
                    Unchecked: Item becomes personal player loot.
                </p>
            `,
            buttons: {
                transfer: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Transfer",
                    callback: async (html) => {
                        const actorId = html.find("#transfer-target").val();
                        const asShared = html.find("#mark-shared").is(":checked");
                        const actor = game.actors.get(actorId);

                        if (actor) {
                            // A. Prepare Data (Prefer sourceData for full stats)
                            let itemData;
                            if (item.sourceData) {
                                itemData = foundry.utils.duplicate(item.sourceData);
                            } else {
                                itemData = {
                                    name: item.name,
                                    type: item.type,
                                    img: item.img,
                                    system: {
                                        description: { value: item.description },
                                        quantity: this.detectQuantity(item.name).quantity || 1
                                    }
                                };
                            }

                            // B. IMPORTANT: Set the Shared Flag if requested
                            if (asShared) {
                                foundry.utils.setProperty(itemData, `flags.${moduleId}.inPartyInventory`, true);
                            }

                            // C. Create on Actor & Delete from Stash
                            await actor.createEmbeddedDocuments("Item", [itemData]);
                            await Scratchpad.requestDelete(itemId);

                            const typeMsg = asShared ? "Shared Item" : "Personal Loot";
                            ui.notifications.info(`Transferred ${item.name} to ${actor.name} as ${typeMsg}.`);
                        }
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel"
                }
            },
            default: "transfer"
        }).render(true);
    }

    async #splitItemLogic(item, itemId) {
        const qr = this.detectQuantity(item.name);
        if (qr.quantity > 1) {
            const splitQty = Math.floor(qr.quantity / 2);
            const keepQty = Math.ceil(qr.quantity / 2);
            
            const newName1 = `${keepQty} ${qr.name}`;
            Scratchpad.requestUpdate(itemId, { name: newName1 });
            
            const newName2 = `${splitQty} ${qr.name}`;
            Scratchpad.requestCreate({
                ...item,
                name: newName2,
                quantity: null,
                id: null
            });
        }
    }

    async _onEditImage(event) {
        const img = event.currentTarget;
        const itemId = img.closest('[data-item-id]')?.dataset.itemId;
        
        const FilePickerClass = foundry.applications.apps?.FilePicker || FilePicker;
        
        const fp = new FilePickerClass({
            type: "image",
            current: img.src,
            callback: path => {
                img.src = path;
                if (itemId) Scratchpad.requestUpdate(itemId, { img: path });
            }
        });
        return fp.browse();
    }

    _onItemSummary(event) {
        event.preventDefault();
        const li = event.currentTarget.closest(".item");
        let summary = li.querySelector(".item-summary");
        if (summary) {
            summary.remove();
        } else {
            const itemId = li.dataset.itemId;
            const item = Scratchpad.getItem(itemId);
            if (item?.description) {
                const div = document.createElement('div');
                div.className = "item-summary";
                div.innerHTML = item.description;
                li.appendChild(div);
            }
        }
    }

    detectQuantity(name = "") {
        const res = { name: name || "", quantity: 1 };
        if (!res.name) return res;

        const matches = res.name.match(/(.+)\s\*(\d+)$/);
        const prefixMatch = res.name.match(/^(\d+)\s+(.+)$/);

        if (matches) {
            res.name = matches[1].trim();
            res.quantity = parseInt(matches[2]);
        } else if (prefixMatch) {
            res.quantity = parseInt(prefixMatch[1]);
            res.name = prefixMatch[2].trim();
        }
        return res;
    }

    _constructExportableData(itemId) {
        const item = Scratchpad.getItem(itemId);
        if (!item) return null;
        if (item.sourceData) return item.sourceData;
        return {
            name: item.name || "Unknown Item",
            type: "loot",
            img: item.img,
            system: { 
                description: { value: item.description || "" },
                quantity: this.detectQuantity(item.name).quantity
            }
        };
    }
}
