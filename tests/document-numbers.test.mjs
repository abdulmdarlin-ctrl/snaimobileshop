import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../utils/documentNumbers.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { allocateDocumentNumbers, documentSeries, isCompactDocumentNumber, documentCounterFloors } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('document sequences use shop-local year and separate invoice and receipt counters', () => {
    const now = Date.UTC(2026,11,31,22);
    assert.equal(documentSeries(now).counterId, 'sales-2027');
    const first = allocateDocumentNumbers({}, true, 1, now);
    assert.equal(allocateDocumentNumbers({}, true, 1, now, 'RCT').invoiceNo, 'INV-27-000001', 'receipt prefix is reserved');
    assert.equal(first.invoiceNo, 'INV-27-000001'); assert.deepEqual(first.receipts, ['RCT-27-000001']);
    const next = allocateDocumentNumbers(first.counter, false, 2, now);
    assert.equal(next.invoiceNo, undefined); assert.deepEqual(next.receipts, ['RCT-27-000002', 'RCT-27-000003']);
    const debt = allocateDocumentNumbers(next.counter, true, 0, now, 'SNA');
    assert.equal(debt.invoiceNo, 'SNA-27-000002'); assert.equal(debt.receipts.length, 0);
});
test('short official references are accepted, long internal UUID references need a saved alias', () => {
    for (const value of ['848', 'INV-848', 'INV-26-000848', 'RCT-26-000512']) assert.equal(isCompactDocumentNumber(value), true);
    for (const value of ['', undefined, 'RCT-a-very-long-sale-id-initial', 'INV-1792240509917-818450a9']) assert.equal(isCompactDocumentNumber(value), false);
    for (const invoice of [-1, 0.5, NaN, Infinity, '12']) assert.throws(() => allocateDocumentNumbers({ invoice }, true, 1));
    assert.throws(() => allocateDocumentNumbers({ receipt: 999999999 }, false, 1));
});

test('restore floors include existing counters and every issued invoice, receipt, and legacy print alias', () => {
    const floors = documentCounterFloors([{ id: 'sales-2026', invoice: 800, receipt: 20 }], [{ invoiceNo: 'INV-26-000848', initialReceiptNo: 'RCT-26-000090', payments: [{ receiptNo: 'RCT-26-000091' }], documentNumbers: { invoice: 'INV-26-000849', receipts: { initial: 'RCT-26-000092' } } }]);
    assert.deepEqual(floors, [{ id: 'sales-2026', invoice: 849, receipt: 92 }]);
    assert.throws(() => documentCounterFloors([{ id: 'bad-path', invoice: 0 }], []));
});
