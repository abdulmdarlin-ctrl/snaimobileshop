import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { jsPDF } from 'jspdf';
const { outputText } = ts.transpileModule(readFileSync(new URL('../utils/fastDocumentPdf.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const exports = {};
vm.runInNewContext(outputText, { exports, require: name => name === 'jspdf' ? {} : { default: 'logo.png' } });
test('direct text PDF accepts supported customer names and retains browser rendering for other scripts', () => {
    for (const value of ['SNA! MOBILE SHOP', 'Émile Müller', 'UGX 2325000.00', 'Customer “Alex” – paid', 'TIN: 100200300']) assert.equal(exports.supportsPdfText(value), true);
    for (const value of ['客戶測試', 'أحمد', 'Customer 😀']) assert.equal(exports.supportsPdfText(value), false);
});

function documentFixture() {
    const node = value => ({ textContent: value, querySelector: () => null, querySelectorAll: () => [] });
    const payment = node('100.00'), total = node('100.00');
    const row = { querySelectorAll: selector => selector === 'td' ? [node('Payment received'), payment] : [] };
    const customer = node('Alice');
    const groups = {
        '.document-business h2, .document-business p': [node('SNA! MOBILE SHOP')],
        '.document-customer h2, .document-customer p': [node('Customer Details :'), customer],
        '.document-items th, .document-payment th': [node('Description'), node('Amount')],
        '.document-items tbody tr, .document-payment tbody tr': [row],
        '.document-grand-total > span, .document-grand-total > strong': [node('Total received :'), total]
    };
    const singles = { '.document-title': node('RECEIPT'), '.document-meta time': node('29-10-2026 10:00 AM'), '.document-meta > span': node('Receipt : RCT-26-000001') };
    const element = { dataset: { documentKind: 'receipt', paperWidth: '80' }, classList: { contains: value => value === 'sale-document-reference' }, querySelector: selector => singles[selector] || null, querySelectorAll: selector => groups[selector] || [] };
    const downloads = [];
    const exports = {};
    vm.runInNewContext(outputText, { exports, require: name => name === 'jspdf' ? { jsPDF } : { default: 'logo.png' },
        getComputedStyle: () => ({ fontFamily: 'Arial, sans-serif', fontSize: '11px', lineHeight: '16px' }),
        document: { body: { appendChild() {} }, createElement: () => ({ style: {}, click() {}, remove() {} }) },
        URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:fixture'; }, revokeObjectURL() {} }, setTimeout: () => 0
    });
    return { element, payment, total, customer, downloads, save: () => exports.exportFastDocumentPdf(element, 'receipt.pdf') };
}
test('unchanged exports reuse their PDF while a visible amount change invalidates the cached document', async () => {
    const f = documentFixture();
    assert.equal(await f.save(), true); assert.ok(f.downloads[0].size > 100);
    await f.save(); assert.equal(f.downloads[0], f.downloads[1]);
    f.payment.textContent = f.total.textContent = '200.00';
    await f.save(); assert.notEqual(f.downloads[2], f.downloads[1]);
});
test('unsupported customer names return to browser-font export rather than losing their text', async () => {
    const f = documentFixture(); f.customer.textContent = '客戶測試';
    assert.equal(await f.save(), false); assert.equal(f.downloads.length, 0);
});
