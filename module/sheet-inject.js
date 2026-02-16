import { moduleId, localizationID } from './const.js';

export function addTogglePartyButton(html, actor) {
    const enableTitle = game.i18n.localize(`${localizationID}.enable-item-title`);
    const disableTitle = game.i18n.localize(`${localizationID}.disable-item-title`);

    // Ensure we have a jQuery object (V13 AppV2 sheets pass raw HTMLElement)
    const $html = $(html);

    // Selector targeting standard 5e sheets (supports Legacy & v3)
    $html.find(".inventory ol:not(.currency-list) .item-control.item-edit, .inventory .item-list .item-control.item-edit").each(function() {
        const li = this.closest(".item");
        if (!li) return; // Safety check

        const currentItemId = li.dataset.itemId;
        const currentItem = actor.items.get(currentItemId);
        
        // Skip if item lookup failed (e.g. race condition or ghost item)
        if (!currentItem) return;

        const isInPartyInventory = currentItem.getFlag(moduleId, 'inPartyInventory');
        const title = isInPartyInventory ? disableTitle : enableTitle;
        const active = isInPartyInventory ? 'active' : '';

        // Create the toggle button
        const $toggle = $(`
            <a class="item-control party-inventory-module item-toggle ${active}" title="${title}">
                <i class="fa-solid fa-users"></i>
            </a>
        `);

        // Insert after the Edit button
        $toggle.insertAfter(this);

        // Attach listener
        $toggle.on('click', async (event) => {
            event.preventDefault();
            await currentItem.setFlag(moduleId, 'inPartyInventory', !isInPartyInventory);
        });
    });
}

export function addTogglePartyButtonTidy(html, actor) {
    const enableTitle = game.i18n.localize(`${localizationID}.enable-item-title`);
    const disableTitle = game.i18n.localize(`${localizationID}.disable-item-title`);

    const $html = $(html);

    $html.find(".inventory .item-control.item-edit").each(function() {
        const li = this.closest(".item");
        if (!li) return;

        const currentItemId = li.dataset.itemId;
        const currentItem = actor.items.get(currentItemId);

        if (!currentItem) return;

        const isInPartyInventory = currentItem.getFlag(moduleId, 'inPartyInventory');
        const title = isInPartyInventory ? disableTitle : enableTitle;
        // TidySheet often uses specific styling, 'active' class usually handles color
        const activeClass = isInPartyInventory ? ' active' : '';
        const iconClass = isInPartyInventory ? 'fa-solid fa-users' : 'fa-solid fa-users-slash'; // Visual feedback

        const $toggle = $(`
            <a class="item-control party-inventory-module${activeClass}" title="${title}">
                <i class="${iconClass}"></i>
                <span class="control-label">${title}</span>
            </a>
        `);

        $toggle.insertAfter(this);

        $toggle.on('click', async (event) => {
            event.preventDefault();
            await currentItem.setFlag(moduleId, 'inPartyInventory', !isInPartyInventory);
        });
    });
}

export function addGroupInventoryIndicatorTidy(html, actor) {
    const title = game.i18n.localize(`${localizationID}.is-in-party-inventory`);
    const $html = $(html);

    $html.find(".inventory .item .item-name").each(function () {
        const li = this.closest(".item");
        if (!li) return;

        const currentItemId = li.dataset.itemId;
        const currentItem = actor.items.get(currentItemId);

        if (currentItem?.getFlag(moduleId, 'inPartyInventory')) {
            const $indicator = $(`
                <div class="item-state-icon" title="${title}" style="margin-right: 0.5rem; color: var(--dnd5e-color-gold);">
                    <i class="fa-solid fa-users"></i>
                </div>
            `);
            
            // Insert after the item name, or before the item controls depending on layout
            $indicator.insertAfter(this);
        }
    });
}
