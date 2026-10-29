import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
function fixture() {
    let document;
    class Element {
        constructor(tagName = 'DIV', className = '') { this.tagName = tagName; this.className = className; this.children = []; this.parentElement = null; this.inert = false; this.disabled = false; this.style = {}; this.dataset = {}; this.attributes = new Map(); this.tabIndex = ['BUTTON', 'INPUT'].includes(tagName) ? 0 : -1; this.classList = { contains: value => this.className.split(' ').includes(value) }; }
        append(child) { child.parentElement = this; this.children.push(child); return child; }
        contains(child) { return child === this || this.children.some(node => node.contains(child)); }
        hasAttribute(key) { return this.attributes.has(key); }
        get isConnected() { return document.body.contains(this); }
        getClientRects() { return [1]; }
        matches(selector) { return selector === ':disabled' && this.disabled; }
        closest(selector) { if (selector === '[inert]') return this.inert ? this : this.parentElement?.closest(selector); if (['app-modal-layer', 'confirmation-layer', 'imei-scanner-layer'].some(value => this.classList.contains(value))) return this; return this.parentElement?.closest(selector) || null; }
        querySelectorAll() { return this.children.flatMap(child => [...(child.tabIndex >= 0 && !child.disabled ? [child] : []), ...child.querySelectorAll()]); }
        focus() { if (this.disabled || this.closest('[inert]')) return; document.activeElement = this; document.emit('focusin', { target: this }); }
    }
    const listeners = new Map(), tasks = [];
    document = { body: new Element('BODY'), activeElement: null, addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: name => listeners.delete(name), emit: (name, event) => listeners.get(name)?.(event) };
    document.body.style.overflow = 'clip';
    const root = document.body.append(new Element()), launch = root.append(new Element('BUTTON'));
    document.activeElement = launch;
    function load(file, dependencies = {}) {
        const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
        const exports = {};
        vm.runInNewContext(outputText, { exports, document, HTMLElement: Element, queueMicrotask: task => tasks.push(task), require: name => dependencies[name] });
        return exports;
    }
    const { activateDialog } = load('../utils/dialogSurface.ts', { './scrollLock': load('../utils/scrollLock.ts') });
    const dialog = () => { const layer = document.body.append(new Element('DIV', 'app-modal-layer')); const panel = layer.append(new Element()); const close = panel.append(new Element('BUTTON')), input = panel.append(new Element('INPUT')), end = panel.append(new Element('BUTTON')); return { layer, panel, close, input, end }; };
    const key = (name, shiftKey = false) => { const event = { key: name, shiftKey, defaultPrevented: false, prevented: false, stopped: false, preventDefault() { this.prevented = this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; } }; document.emit('keydown', event); return event; };
    return { document, root, launch, dialog, activateDialog, key, flush: () => { while (tasks.length) tasks.shift()(); }, listeners };
}
test('nested dialogs have one focus owner, one Escape target, and restore the opener', () => {
    const f = fixture(), parent = f.dialog(); let parentClosed = 0, childClosed = 0;
    const closeParent = f.activateDialog(parent.panel, () => parentClosed++);
    assert.equal(f.root.inert, true);
    assert.equal(f.document.activeElement, parent.close);
    parent.end.focus(); f.key('Tab'); assert.equal(f.document.activeElement, parent.close);
    f.key('Tab', true); assert.equal(f.document.activeElement, parent.end);
    const child = f.dialog(); const closeChild = f.activateDialog(child.panel, () => childClosed++);
    assert.equal(parent.layer.inert, true);
    assert.ok(Number(child.layer.style.zIndex) > Number(parent.layer.style.zIndex));
    const escape = f.key('Escape'); assert.equal(childClosed, 1); assert.equal(parentClosed, 0); assert.equal(escape.stopped, true);
    closeChild(); child.layer.parentElement.children.splice(child.layer.parentElement.children.indexOf(child.layer), 1); f.flush();
    assert.equal(parent.layer.inert, false);
    assert.equal(f.document.activeElement, parent.end);
    assert.equal(f.document.body.style.overflow, 'hidden');
    f.key('Escape'); assert.equal(parentClosed, 1);
    closeParent(); f.flush(); assert.equal(f.document.activeElement, f.launch); assert.equal(f.root.inert, false); assert.equal(f.document.body.style.overflow, 'clip'); assert.equal(f.listeners.size, 0);
});
test('out-of-order cleanup keeps the front dialog usable and preserves earlier inert state', () => {
    const f = fixture(), prior = f.document.body.append(new f.root.constructor()); prior.inert = true;
    const parent = f.dialog(), closeParent = f.activateDialog(parent.panel, () => {});
    const child = f.dialog(), closeChild = f.activateDialog(child.panel, () => {});
    closeParent(); closeParent(); f.flush();
    assert.equal(f.document.body.style.overflow, 'hidden'); assert.equal(child.layer.inert, false);
    child.end.focus(); f.key('Tab'); assert.equal(f.document.activeElement, child.close);
    closeChild(); f.flush(); assert.equal(prior.inert, true); assert.equal(f.root.inert, false); assert.equal(f.document.body.style.overflow, 'clip');
});
test('input prompts can request field focus and closing skips a disabled opener', () => {
    const f = fixture(), parent = f.dialog(), releaseParent = f.activateDialog(parent.panel, () => {});
    parent.end.focus(); parent.end.disabled = true;
    const child = f.dialog(), releaseChild = f.activateDialog(child.panel, () => {}, () => child.input);
    assert.equal(f.document.activeElement, child.input);
    releaseChild(); f.flush(); assert.equal(f.document.activeElement, parent.close);
    releaseParent(); f.flush();
});
