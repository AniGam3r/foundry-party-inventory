import { moduleId, localizationID } from './const.js';

export function addTogglePartyButton(html, actor) {
    const enableTitle = game.i18n.localize(`${localizationID}.enable-item-title`);
    const disableTitle = game.i18n.localize(`${localizationID}.disable-item-title`);

    // Target edit buttons for Standard 5e (old/new) and Tidy5e
    const selector = ".item-control.item-edit, [data-action='edit'], .tidy-table-row .item-control";
    const editButtons = html.querySelectorAll(selector);
    
    editButtons.forEach(btn => {
        const li = btn.closest(".item, .tidy-table-row, [data-item-id]");
        if (!li || li.querySelector(".party-inventory-module")) return;

        const item = actor.items.get(li.dataset.itemId);
        if (!item) return;

        const isInParty = !!item.getFlag(moduleId, 'inPartyInventory');
        
        const toggle = document.createElement("a");
        toggle.classList.add("item-control", "party-inventory-module");
        if (isInParty) toggle.classList.add("active");
        toggle.dataset.tooltip = isInParty ? disableTitle : enableTitle;
        toggle.innerHTML = `<i class="fa-solid fa-users"></i>`;

        toggle.onclick = async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            await item.setFlag(moduleId, 'inPartyInventory', !isInParty);
        };

        btn.after(toggle);
    });
}

export function addGroupInventoryIndicatorTidy(html, actor) {
    const title = game.i18n.localize(`${localizationID}.is-in-party-inventory`);
    const names = html.querySelectorAll(".item-name, .name");

    names.forEach(nameDiv => {
        const li = nameDiv.closest(".item, .tidy-table-row, [data-item-id]");
        if (!li || li.querySelector(".party-item-indicator")) return;

        const item = actor.items.get(li.dataset.itemId);
        if (item?.getFlag(moduleId, 'inPartyInventory')) {
            const indicator = document.createElement("div");
            indicator.classList.add("party-item-indicator");
            indicator.title = title;
            indicator.style.display = "inline-block";
            indicator.style.marginRight = "5px";
            indicator.style.color = "var(--dnd5e-color-gold, #ff6400)";
            indicator.innerHTML = `<i class="fa-solid fa-users"></i>`;
            nameDiv.prepend(indicator);
        }
    });
}
