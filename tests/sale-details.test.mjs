import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../utils/saleDetails.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { saleDateInput, formatSaleDate, validSaleDueDate, validateSaleDetails } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('sale dates use Uganda shop time and preserve date-only payment terms', () => {
    assert.equal(saleDateInput(Date.UTC(2026, 9, 28, 22)), '2026-10-29');
    assert.equal(formatSaleDate(Date.UTC(2026, 9, 28, 22)), '29/10/26');
    assert.equal(formatSaleDate('2026-11-05'), '05/11/26');
    assert.equal(formatSaleDate(), 'Not set');
    assert.equal(formatSaleDate(NaN), 'Not set');
    assert.equal(validSaleDueDate('2026-02-29'), false);
    assert.equal(validSaleDueDate('2028-02-29'), true);
    assert.equal(validSaleDueDate('2026-13-01'), false);
});
test('payment due dates validate real days and notes are trimmed without accepting unlimited input', () => {
    const sale = { timestamp: Date.UTC(2026, 9, 28, 22) };
    assert.deepEqual(validateSaleDetails(sale, '2026-10-29', ' Note '), { dueDate: '2026-10-29', notes: 'Note' });
    assert.deepEqual(validateSaleDetails(sale, '', ''), { dueDate: '', notes: '' });
    for (const value of ['2026-10-28', '2026-11-31', '29/10/26', null]) assert.throws(() => validateSaleDetails(sale, value, ''), /date/);
    assert.throws(() => validateSaleDetails(sale, '', 'x'.repeat(2001)), /2,000/);
});
