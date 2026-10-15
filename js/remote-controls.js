// Shared keyboard/remote navigation; native pointer controls remain available.
(function () {
    const selector = 'button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"],[tabindex="0"]';
    let previousScope = null;
    let opener = null;
    const visible = el => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden],#settingsPanel:not(.show),#historyPanel:not(.show)'));
    function scope() {
        const overlays = Array.from(document.querySelectorAll('[id$="Modal"],#modal,#settingsPanel.show,#historyPanel.show')).filter(visible);
        return overlays.sort((a,b) => (parseInt(getComputedStyle(a).zIndex) || 0) - (parseInt(getComputedStyle(b).zIndex) || 0)).pop() || document.body;
    }
    function controls(root) {
        return Array.from(root.querySelectorAll(selector)).filter(el => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.tabIndex >= 0);
    }
    function enhance() {
        document.querySelectorAll('div[onclick],span[onclick]').forEach(el => {
            if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
            if (!el.hasAttribute('role')) el.setAttribute('role','button');
        });
        const root = scope();
        if (root !== previousScope) {
            if (root !== document.body) {
                if (previousScope === document.body || !previousScope) opener = document.activeElement;
                const first = controls(root)[0];
                if (first && !root.contains(document.activeElement)) first.focus();
            } else if (visible(opener)) opener.focus();
            previousScope = root;
        }
    }
    function move(event, root) {
        const items = controls(root), active = document.activeElement;
        if (!items.length) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (!items.includes(active)) { items[0].focus(); return; }
        const rect = active.getBoundingClientRect();
        const x = rect.left + rect.width/2, y = rect.top + rect.height/2;
        const horizontal = /Left|Right/.test(event.key), sign = /Left|Up/.test(event.key) ? -1 : 1;
        let target = null, best = Infinity;
        items.forEach(el => {
            if (el === active) return;
            const r = el.getBoundingClientRect(), dx = r.left + r.width/2 - x, dy = r.top + r.height/2 - y;
            const forward = (horizontal ? dx : dy)*sign, sideways = Math.abs(horizontal ? dy : dx);
            if (forward <= 2) return;
            const score = forward + sideways*4;
            if (score < best) { best = score; target = el; }
        });
        if (target) { target.focus(); target.scrollIntoView({block:'nearest',inline:'nearest'}); }
    }
    document.addEventListener('keydown', function (event) {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        enhance();
        const root = scope(), active = document.activeElement;
        if (typeof art !== 'undefined' && art && (art.fullscreen || art.fullscreenWeb)) {
            if (['Escape','BrowserBack','GoBack'].includes(event.key)) {
                event.preventDefault(); event.stopImmediatePropagation();
                if (art.fullscreenWeb) art.fullscreenWeb = false;
                if (art.fullscreen) art.fullscreen = false;
                return;
            }
            if (['Enter','Select','Accept'].includes(event.key)) {
                event.preventDefault(); event.stopImmediatePropagation(); art.toggle(); return;
            }
        }
        const isText = active && (active.matches('textarea,select,[contenteditable="true"]') || active.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="button"])'));
        if (isText && !['ArrowUp','ArrowDown','Escape'].includes(event.key)) return;
        if (event.key.startsWith('Arrow')) {
            if (document.fullscreenElement || (typeof art !== 'undefined' && art && (art.fullscreen || art.fullscreenWeb))) return;
            move(event,root);
        } else if (['Enter',' ','Select','Accept'].includes(event.key) && active && root.contains(active) && active.matches(selector) && !active.disabled && !isText) {
            event.preventDefault(); event.stopImmediatePropagation(); active.click();
        } else if (['Escape','BrowserBack','GoBack'].includes(event.key) && root !== document.body) {
            const close = root.querySelector('.close-btn,button[onclick="closeModal()"],#closeBoxModal,#cancelBoxModal,#cancelUrlImport');
            if (close) { event.preventDefault(); event.stopImmediatePropagation(); close.click(); }
        }
    },true);
    document.addEventListener('DOMContentLoaded',function () {
        const style = document.createElement('style');
        style.textContent = ':is(button,a,input,select,textarea,summary,[role="button"]):focus-visible{outline:4px solid #38bdf8!important;outline-offset:3px} [role="button"]:focus{outline:4px solid #38bdf8!important;outline-offset:3px}';
        document.head.appendChild(style);
        enhance();
        new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});
    });
})();

