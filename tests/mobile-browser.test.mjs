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
        './SaleDetailsDialog': { default: () => null, __esModule: true }, './SaleDocumentDialog': { default: () => null, __esModule: true }, './PhoneSaleLookup': { default: () => null, __esModule: true }, '../utils/saleDocuments': {}, '../assets/SNAI-LOGO.png': 'logo.png',
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
    const docs = load('../utils/saleDocuments.ts', { './pos': posTools, './documentNumbers': load('../utils/documentNumbers.ts') });
    const Document = load('../components/SaleDocument.tsx', { '../utils/pos': posTools, '../utils/imei': load('../utils/imei.ts'), '../utils/saleDocuments': docs, '../utils/saleDetails': load('../utils/saleDetails.ts'), '../utils/documentNumbers': load('../utils/documentNumbers.ts'), '../assets/SNAI-LOGO.png': 'logo.png' }).default;
    const sale = { id: 's1', receiptNo: 'INV-26-000848', initialReceiptNo: 'RCT-26-000512', customerKind: 'Walk-in', walkInName: 'Visitor Name', customerName: 'Walk-in', items: [{ productId: 'p1', name: 'Phone', quantity: 1, price: 100, total: 100, imeis: ['490154203237518'] }], subtotal: 100, discount: 0, total: 100, amountPaid: 40, paymentMethod: 'Cash', timestamp: 10, cashierName: 'Cashier' };
    const render = (mode, value = sale) => renderToString(React.createElement(Document, { sale: value, settings: null, mode }));
    const invoice = render('invoice').replaceAll('<!-- -->', '');
    assert.match(invoice, /src="logo.png"/); assert.match(invoice, /INVOICE/); assert.match(invoice, /Visitor Name/); assert.match(invoice, /490154203237518/); assert.match(invoice, /Total/); assert.match(invoice, /UGX 100/); assert.doesNotMatch(invoice, /Money received|Outstanding|Payment method|Payment status|Balance after/);
    const receipt = render('receipt').replaceAll('<!-- -->', '');
    assert.match(receipt, /RECEIPT/); assert.match(receipt, /RCT-26-000512/); assert.match(receipt, /UGX 40/); assert.doesNotMatch(receipt, /Invoice total|INVOICE|INV-26|490154203237518|Phone|Qty|Outstanding|QR|SNA-VERIFY|data:image/);
    assert.match(render('receipt', { ...sale, amountPaid: 0 }), /No payment has been received/);
});

test('checkout picker shows the selected customer and a dedicated keyboard-friendly search input', () => {
    const customers = load('../utils/customers.ts');
    const search = load('../utils/customerSearch.ts', { './customers': customers });
    const Picker = load('../components/CheckoutCustomerPicker.tsx', { '../utils/customerSearch': search, '../utils/customers': customers }).default;
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


test('checkout picker visibly identifies a selected customer with no recorded phone', () => {
    const customers = load('../utils/customers.ts');
    const search = load('../utils/customerSearch.ts', { './customers': customers });
    const Picker = load('../components/CheckoutCustomerPicker.tsx', { '../utils/customerSearch': search, '../utils/customers': customers }).default;
    const html = renderToString(React.createElement(Picker, { customers: [{ id: 'c1', name: 'MSAWO RASHIDA' }], selectedName: 'MSAWO RASHIDA', selectedPhone: '', onSelect() {}, onClear() {}, onCreate() {} }));
    assert.match(html, /MSAWO RASHIDA/);
    assert.match(html, /Phone not recorded/);
    assert.match(html, /Remove selected customer/);
});


const detailPos = load('../utils/pos.ts');
const detailDocs = load('../utils/saleDocuments.ts', { './pos': detailPos, './documentNumbers': load('../utils/documentNumbers.ts') });
const detailView = load('../components/SaleDetailsDialog.tsx', {
    '../utils/pos': detailPos, '../utils/saleDocuments': detailDocs, '../utils/imei': load('../utils/imei.ts'),
    '../utils/saleDetails': load('../utils/saleDetails.ts'), '../utils/dialog': {},
    './Modal': { default: ({ children }) => React.createElement('div', null, children), __esModule: true }
}).default;
const referenceSale = { id: 'reference', receiptNo: 'INV-REF', customerName: 'SNAI KYAZANGA', timestamp: Date.UTC(2026, 9, 29, 10), dueDate: '2026-11-05',
    items: [{ productId: 'p1', name: 'V50s 32+3', quantity: 20, price: 275000, total: 5500000 }, { productId: 'p2', name: 'V50s 64+4', quantity: 5, price: 334000, total: 1670000 }, { productId: 'p3', name: 'V105', quantity: 60, price: 24000, total: 1440000 }],
    subtotal: 8610000, discount: 0, tax: 0, total: 8610000, amountPaid: 0, paymentMethod: 'Cash', cashierName: 'Snai' };
function renderDetails(initialTab = 'items', canEdit = true, sale = referenceSale) {
    return renderToString(React.createElement(detailView, { sale, isOpen: true, canEdit, initialTab, onClose() {}, onEdit() {}, onAddItem() {}, onScanItem() {}, onPayment() {}, onDocument() {}, async onSaveDetails() {} }));
}
test('sale details matches the reference structure and displays real invoice amounts and dates', () => {
    const html = renderDetails();
    for (const content of ['SNAI KYAZANGA', 'Pending Payment', '29/10/26', '05/11/26', 'Items', 'Payments', 'Details', 'Sub Total:', 'Discount:', 'Shipping:', 'Taxes:', 'TOTAL:', '8,610,000.00', 'V50s 32+3', 'V50s 64+4', 'V105', '5,500,000.00', '1,670,000.00', '1,440,000.00', 'Add Item', 'Scan phone IMEI to add an item']) assert.ok(html.includes(content), content);
    assert.match(html, /role="tablist"/);
    assert.match(html, /role="tabpanel"/);
    assert.match(html, /aria-selected="true"/);
    assert.match(html, /Options for V50s 32\+3/);
    assert.doesNotMatch(renderDetails('items', false), /Add Item|Scan phone IMEI to add an item/);
});
test('sale details payments distinguish debt from money received and show actual receipts', () => {
    assert.match(renderDetails('payments'), /No payment has been recorded/);
    assert.match(renderDetails('payments'), /Record payment/);
    const paid = renderDetails('payments', true, { ...referenceSale, amountPaid: 8610000 });
    assert.match(paid, /Paid in Full/);
    assert.doesNotMatch(paid, /Record payment/);
    assert.match(paid.replaceAll('<!-- -->', ''), /Received by Snai/);
    assert.match(renderDetails('details'), /type="date"/);
    assert.doesNotMatch(renderDetails('details', false), /Save details|Edit invoice/);
});


test('reference invoice contains only goods and charges, while receipts contain only the selected payment', () => {
    const tools = load('../utils/pos.ts');
    const docs = load('../utils/saleDocuments.ts', { './pos': tools, './documentNumbers': load('../utils/documentNumbers.ts') });
    const Document = load('../components/SaleDocument.tsx', { '../utils/pos': tools, '../utils/imei': load('../utils/imei.ts'), '../utils/saleDocuments': docs, '../utils/saleDetails': load('../utils/saleDetails.ts'), '../utils/documentNumbers': load('../utils/documentNumbers.ts'), '../assets/SNAI-LOGO.png': 'logo.png' }).default;
    const sale = { id: 'reference', receiptNo: 'INV-26-000848', initialReceiptNo: 'RCT-26-000512', timestamp: Date.UTC(2026,9,26,15,42), customerName: 'SNA Mobile', customerPhone: '774237136', customerAddress: 'Kisoro', cashierName: 'Snai', items: [{ productId: 'p1', name: 'Samsung A07 64gb', quantity: 5, price: 465000, total: 2325000 }], subtotal: 2325000, discount: 0, total: 2325000, amountPaid: 500000, paymentMethod: 'Bank', paymentReference: 'BANK-123', payments: [{ id: 'next', receiptNo: 'RCT-26-000513', amount: 200000, method: 'Cash', timestamp: Date.UTC(2026,9,27,15,42), user: 'Other attendant' }] };
    const settings = { logo: 'custom-shop-logo.png', businessName: 'SNA! MOBILE SHOP', address: 'KYAZANGA OPP STABEX PETROL STATION', phone: '+256 756337888 | +256 778413197', tin: '100200300' };
    const render = (mode, receiptId) => renderToString(React.createElement(Document, { sale, settings, mode, receiptId })).replaceAll('<!-- -->', '');
    const invoice = render('invoice');
    for (const text of ['INVOICE', '26-10-2026 6:42 PM', 'SNA Mobile', 'Contact : 774237136', 'Kisoro', 'Samsung A07 64gb', '2325000.00', 'Items : 1', 'Sub Total', 'Qty', 'Rate']) assert.ok(invoice.includes(text), text);
    assert.doesNotMatch(invoice, /Money received|Outstanding|RECEIPT|Received by|BANK-123|Payment method/);
    const receipt = render('receipt', 'next');
    for (const text of ['RECEIPT', 'RCT-26-000513', '200000.00', 'Cash', 'Other attendant']) assert.ok(receipt.includes(text), text);
    assert.doesNotMatch(receipt, /INVOICE|INV-26|Samsung|Qty|Rate|2325000|Sub Total|Outstanding|BANK-123/);
    assert.match(render('receipt', 'initial'), /300000.00/);
    for (const document of [invoice, receipt]) {
        for (const text of ['SNA! MOBILE SHOP', 'KYAZANGA OPP STABEX PETROL STATION', 'Tel: +256 756337888 | +256 778413197', 'TIN: 100200300']) assert.ok(document.includes(text), text);
        assert.ok(document.indexOf('document-business') < document.indexOf('document-title'));
        assert.match(document, /src="custom-shop-logo.png"/);
        assert.ok(document.indexOf('document-business-logo') < document.indexOf('<h2>'));
    }
});
