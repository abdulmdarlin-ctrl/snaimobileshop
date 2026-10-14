import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../utils/customers.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { getCustomerSales, normalizeCustomerPhone, escapeCustomerCSVCell } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('normalizes local, formatted and international Uganda numbers', () => {
    for (const phone of ['0700 123 456', '+256 700 123456', '00256700123456']) {
        assert.equal(normalizeCustomerPhone(phone), '256700123456');
    }
    assert.equal(normalizeCustomerPhone(), '');
});

test('does not associate anonymous sales with customers having blank phones', () => {
    const customer = { name: 'Alice', phone: '' };
    assert.deepEqual(getCustomerSales([{ customerPhone: '', customerName: '' }, {}], customer, [customer]), []);
});

test('same-name customers with different phones have separate statements', () => {
    const alice = { name: 'Alex', phone: '0700123456' };
    const other = { name: 'Alex', phone: '0700654321' };
    const sale = { customerName: 'Alex', customerPhone: '+256700123456' };
    assert.deepEqual(getCustomerSales([sale], alice, [alice, other]), [sale]);
    assert.deepEqual(getCustomerSales([sale], other, [alice, other]), []);
});

test('legacy name-only sales require a unique nonempty name', () => {
    const customer = { name: 'Alice', phone: '0700123456' };
    const sale = { customerName: ' ALICE ' };
    assert.deepEqual(getCustomerSales([sale], customer, [customer]), [sale]);
    assert.deepEqual(getCustomerSales([sale], customer, [customer, { name: 'alice', phone: '0700654321' }]), []);
});

test('duplicate legacy phone numbers do not double-count sales', () => {
    const customer = { name: 'Alice', phone: '0700123456' };
    const other = { name: 'Bob', phone: '+256700123456' };
    assert.deepEqual(getCustomerSales([{ customerPhone: customer.phone }], customer, [customer, other]), []);
});

test('CSV preserves commas, quotes and line breaks within one quoted cell', () => {
    assert.equal(escapeCustomerCSVCell('A, "B"\nC'), '"A, ""B""\nC"');
    assert.equal(escapeCustomerCSVCell(null), '""');
    assert.equal(escapeCustomerCSVCell(12500), '"12500"');
});

test('CSV neutralizes formula-like text and preserves international phone numbers as text', () => {
    assert.equal(escapeCustomerCSVCell('=1+1'), '"\'=1+1"');
    assert.equal(escapeCustomerCSVCell('+256700123456'), '"\'+256700123456"');
});
