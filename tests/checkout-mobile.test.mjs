import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}) {
    const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const exports = {};
    vm.runInNewContext(outputText, { exports, require: name => { if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`); return dependencies[name]; } });
    return exports;
}
const { lockBodyScroll } = load('../utils/scrollLock.ts');
const { watchMobileViewport } = load('../utils/mobileViewport.ts');
const { indexCustomers, searchCustomers } = load('../utils/customerSearch.ts', { './customers': load('../utils/customers.ts') });

test('closing nested dialogs cannot unlock checkout, including out-of-order cleanup', () => {
    const body = { style: { overflow: 'clip' } };
    const checkout = lockBodyScroll(body), confirmation = lockBodyScroll(body);
    assert.equal(body.style.overflow, 'hidden');
    checkout();
    assert.equal(body.style.overflow, 'hidden');
    checkout();
    assert.equal(body.style.overflow, 'hidden');
    confirmation();
    assert.equal(body.style.overflow, 'clip');
    const reopen = lockBodyScroll(body);
    assert.equal(body.style.overflow, 'hidden');
    reopen();
    assert.equal(body.style.overflow, 'clip');
});
test('customer search indexes contacts once and accepts local/international phone formats and multiple fields', () => {
    let reads = 0;
    const records = Array.from({ length: 10000 }, (_, id) => ({ id: String(id), get name() { reads++; return id === 9999 ? 'Emma Customer' : `Customer ${id}`; }, phone: id === 9999 ? '+256 700 123 456' : '', email: id === 9999 ? 'emma@example.com' : '', address: 'Kyazanga' }));
    const index = indexCustomers(records);
    assert.equal(reads, 10000);
    for (const query of ['EMMA', '0700123456', '256700123456', 'emma@example.com', 'emma kyazanga']) assert.equal(searchCustomers(index, query)[0].id, '9999');
    assert.equal(searchCustomers(index, 'not-present').length, 0);
    assert.equal(searchCustomers(index, ' ').length, 0);
    assert.equal(reads, 10000, 'typing does not normalize every customer again');
});
test('common search prefixes stop after five matches instead of collecting thousands of results', () => {
    let scanned = 0;
    const index = Array.from({ length: 10000 }, (_, id) => ({ customer: { id }, get text() { scanned++; return 'customer'; } }));
    assert.equal(searchCustomers(index, 'cust').length, 5);
    assert.equal(scanned, 5);
});

function viewportFixture(withVisualViewport = true) {
    const events = () => {
        const listeners = new Map();
        return { addEventListener: (key, listener) => { listeners.set(key, listener); }, removeEventListener: key => { listeners.delete(key); }, emit: key => listeners.get(key)?.(), listeners };
    };
    const viewport = { ...events(), height: 800, offsetTop: 0, scale: 1 };
    const frames = new Map(), properties = new Map();
    let sequence = 0, writes = 0;
    const win = { ...events(), innerHeight: 800, visualViewport: withVisualViewport ? viewport : null,
        requestAnimationFrame: callback => { frames.set(++sequence, callback); return sequence; }, cancelAnimationFrame: id => frames.delete(id) };
    const root = { style: { setProperty: (key, value) => { properties.set(key, value); writes++; }, removeProperty: key => properties.delete(key) } };
    return { win, viewport, root, properties, frames, writes: () => writes, flush: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); } };
}
test('keyboard resize and pan events share one animation frame and keep the modal above the keyboard', () => {
    const fixture = viewportFixture();
    const stop = watchMobileViewport(fixture.win, fixture.root);
    assert.equal(fixture.properties.get('--app-viewport-height'), '800px');
    fixture.viewport.height = 390; fixture.viewport.offsetTop = 24;
    for (let i = 0; i < 20; i++) { fixture.viewport.emit('resize'); fixture.viewport.emit('scroll'); fixture.win.emit('resize'); }
    assert.equal(fixture.frames.size, 1);
    fixture.flush();
    assert.equal(fixture.properties.get('--app-viewport-height'), '390px');
    assert.equal(fixture.properties.get('--app-viewport-top'), '24px');
    const before = fixture.writes();
    fixture.viewport.emit('resize'); fixture.flush();
    assert.equal(fixture.writes(), before, 'unchanged viewport dimensions do not force repeated style updates');
    fixture.viewport.scale = 2; fixture.viewport.height = 180; fixture.viewport.emit('resize'); fixture.flush();
    assert.equal(fixture.properties.get('--app-viewport-height'), '390px', 'pinch zoom does not resize the dialog');
    fixture.viewport.emit('resize'); stop();
    assert.equal(fixture.frames.size, 0);
    assert.equal(fixture.properties.size, 0);
    assert.equal(fixture.viewport.listeners.size, 0);
    assert.equal(fixture.win.listeners.size, 0);
});
test('older browsers fall back to window height and restore it when the keyboard closes', () => {
    const fixture = viewportFixture(false);
    const stop = watchMobileViewport(fixture.win, fixture.root);
    fixture.win.innerHeight = 360; fixture.win.emit('resize'); fixture.flush();
    assert.equal(fixture.properties.get('--app-viewport-height'), '360px');
    fixture.win.innerHeight = 800; fixture.win.emit('resize'); fixture.flush();
    assert.equal(fixture.properties.get('--app-viewport-height'), '800px');
    stop();
});
