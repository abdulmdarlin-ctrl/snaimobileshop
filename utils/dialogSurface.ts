import { lockBodyScroll } from './scrollLock';

type Surface = { panel: HTMLElement; layer: HTMLElement; dismiss: () => void; previous: HTMLElement | null; initial?: () => HTMLElement | null };
const surfaces: Surface[] = [];
const inertBefore = new Map<HTMLElement, boolean>();
const controls = (panel: HTMLElement) => Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]')).filter(element => element.tabIndex >= 0 && !element.closest('[inert]') && element.getClientRects().length);
const top = () => surfaces[surfaces.length - 1];
const focus = (surface: Surface) => (surface.initial?.() || controls(surface.panel)[0] || surface.panel).focus({ preventScroll: true });

function refresh() {
    const active = top();
    const blocked = new Set<HTMLElement>();
    if (active) {
        let branch: HTMLElement = active.layer;
        while (branch.parentElement) {
            for (const sibling of Array.from(branch.parentElement.children)) if (sibling !== branch && sibling instanceof HTMLElement && !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName) && !sibling.classList.contains('mobile-menu-backdrop')) blocked.add(sibling);
            if (branch.parentElement === document.body) break;
            branch = branch.parentElement;
        }
    }
    for (const [node, original] of inertBefore) if (!blocked.has(node)) { node.inert = original; inertBefore.delete(node); }
    for (const node of blocked) { if (!inertBefore.has(node)) inertBefore.set(node, node.inert); node.inert = true; }
    surfaces.forEach((surface, index) => {
        surface.layer.style.zIndex = String(10000 + index);
        surface.layer.dataset.dialogInactive = surface === active ? 'false' : 'true';
    });
}
function keyboard(event: KeyboardEvent) {
    const active = top();
    if (!active || event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); active.dismiss(); return; }
    if (event.key !== 'Tab') return;
    const elements = controls(active.panel), first = elements[0], last = elements[elements.length - 1];
    if (!first) { event.preventDefault(); active.panel.focus({ preventScroll: true }); return; }
    if (!active.panel.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
    }
}
function keepFocus(event: FocusEvent) {
    const active = top();
    if (active && !active.panel.contains(event.target as Node)) focus(active);
}

/** One focus owner and scroll lock for all app dialogs, including nested camera/confirmation windows. */
export function activateDialog(panel: HTMLElement, dismiss: () => void, initial?: () => HTMLElement | null) {
    const surface: Surface = { panel, dismiss, initial, previous: document.activeElement as HTMLElement | null,
        layer: panel.closest<HTMLElement>('.app-modal-layer, .confirmation-layer, .imei-scanner-layer') || panel };
    const unlock = lockBodyScroll();
    if (!panel.hasAttribute('tabindex')) panel.tabIndex = -1;
    surfaces.push(surface); refresh();
    if (surfaces.length === 1) { document.addEventListener('keydown', keyboard, true); document.addEventListener('focusin', keepFocus, true); }
    focus(surface);
    let released = false;
    return () => {
        if (released) return;
        released = true;
        const wasTop = top() === surface;
        surfaces.splice(surfaces.indexOf(surface), 1); refresh(); unlock();
        if (!surfaces.length) { document.removeEventListener('keydown', keyboard, true); document.removeEventListener('focusin', keepFocus, true); }
        const next = top();
        if (wasTop) queueMicrotask(() => {
            if (top() !== next) return;
            if (surface.previous?.isConnected && !surface.previous.closest('[inert]') && !surface.previous.matches(':disabled') && (!next || next.panel.contains(surface.previous))) surface.previous.focus({ preventScroll: true });
            else if (next) focus(next);
        });
    };
}
