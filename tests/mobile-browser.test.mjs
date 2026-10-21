import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToString } from 'react-dom/server';

const require = createRequire(import.meta.url);
const localCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
const browser = { matchMedia: () => ({ matches: false }), innerWidth: 390 };
function load(relative, dependencies = {}, crypto = localCrypto) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } });
    const exports = {};
    vm.runInNewContext(outputText, { exports, crypto, window: browser, console, require: name => {
        if (name in dependencies) return dependencies[name];
        if (name === 'react' || name === 'lucide-react') return require(name);
        throw new Error(`Unexpected dependency ${name}`);
    } });
    return exports;
}

test('phone sales renders on local HTTP without crypto.randomUUID', () => {
    const ids = load('../utils/id.ts');
    const pos = load('../components/POS.tsx', {
        './InvoiceProductPicker': { default: () => null, __esModule: true }, './CheckoutCustomerPicker': { default: () => null, __esModule: true }, '../utils/id': ids, '../utils/scanToSell': {}, './ImeiScanner': { default: () => null, __esModule: true }, '../utils/databaseErrors': load('../utils/databaseErrors.ts'),
        '../utils/dialog': {}, '../db': {}, '../utils/imei': load('../utils/imei.ts'),
        '../utils/pos': load('../utils/pos.ts'), '../utils/customers': load('../utils/customers.ts'),
        '../types': load('../types.ts'), '../utils/printExport': {},
        './Toast': { useToast: () => ({ showToast() {} }) }, './Modal': { default: () => null, __esModule: true },
        './SaleDocumentDialog': { default: () => null, __esModule: true }, './PhoneSaleLookup': { default: () => null, __esModule: true }, '../utils/saleDocuments': {}, '../assets/SNAI-LOGO.png': 'logo.png',
    });
    const html = renderToString(React.createElement(pos.default, { user: { id: 'attendant', username: 'Attendant', role: 'Admin' } }));
    assert.match(html, /Products/);
    assert.match(html, /Order/);
    assert.match(html, /Scan to sell/);
});

test('UUID fallback preserves v4 format and generates distinct transaction IDs', () => {
    const { createId } = load('../utils/id.ts');
    const ids = Array.from({ length: 200 }, () => createId());
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('documents distinguish goods invoiced from individual payments and print the walk-in name without a QR', () => {
    const posTools = load('../utils/pos.ts');
    const docs = load('../utils/saleDocuments.ts', { './pos': posTools });
    const Document = load('../components/SaleDocument.tsx', { '../utils/pos': posTools, '../utils/imei': load('../utils/imei.ts'), '../utils/saleDocuments': docs, '../assets/SNAI-LOGO.png': 'logo.png' }).default;
    const sale = { id: 's1', receiptNo: 'INV-1', customerKind: 'Walk-in', walkInName: 'Visitor Name', customerName: 'Walk-in', items: [{ productId: 'p1', name: 'Phone', quantity: 1, price: 100, total: 100, imeis: ['490154203237518'] }], subtotal: 100, discount: 0, total: 100, amountPaid: 40, paymentMethod: 'Cash', timestamp: 10, cashierName: 'Cashier' };
    const render = (mode, value = sale) => renderToString(React.createElement(Document, { sale: value, settings: null, mode }));
    const invoice = render('invoice');
    assert.match(invoice, /SALES INVOICE/); assert.match(invoice, /Visitor Name/); assert.match(invoice, /490154203237518/); assert.match(invoice, /Invoice total/); assert.match(invoice, /UGX 100/); assert.match(invoice, /UGX 60/);
    const receipt = render('receipt');
    assert.match(receipt, /PAYMENT RECEIPT/); assert.match(receipt, /RCT-s1-initial/); assert.match(receipt, /UGX 40/); assert.doesNotMatch(receipt, /Invoice total|QR|SNA-VERIFY|data:image/);
    assert.match(render('receipt', { ...sale, amountPaid: 0 }), /No payment has been received/);
});

test('checkout picker shows the selected customer and a dedicated keyboard-friendly search input', () => {
    const customers = load('../utils/customers.ts');
    const search = load('../utils/customerSearch.ts', { './customers': customers });
    const Picker = load('../components/CheckoutCustomerPicker.tsx', { '../utils/customerSearch': search }).default;
    const html = renderToString(React.createElement(Picker, { customers: [], selectedName: 'Emma Customer', selectedPhone: '0700123456', onSelect() {}, onClear() {}, onCreate() {} }));
    assert.match(html, /role="combobox"/);
    assert.match(html, /autoComplete="off"/);
    assert.match(html, /enterKeyHint="search"/);
    assert.match(html, /Emma Customer/);
    assert.match(html, /0700123456/);
    assert.match(html, /Remove selected customer/);
});

test('invoice product picker renders an accessible search field without an unbounded select list', () => {
    const search = load('../utils/productSearch.ts');
    const Picker = load('../components/InvoiceProductPicker.tsx', { '../utils/productSearch': search }).default;
    const html = renderToString(React.createElement(Picker, { products: [{ id: 'p1', name: 'T528 NEW', stockQuantity: 2, selling_price: 65500 }], items: [], priceFor: product => product.selling_price, onAdd() {} }));
    assert.match(html, /Add product/);
    assert.match(html, /role="combobox"/);
    assert.match(html, /Search product name or brand/);
    assert.doesNotMatch(html, /<select/);
});
