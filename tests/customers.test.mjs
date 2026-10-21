import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../utils/customers.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { findCustomerMatches, customerStatus, getCustomerSales, normalizeCustomerPhone, escapeCustomerCSVCell, validateCustomerContact, customerAccountSummary, resolveCheckoutCustomer, registeredCustomerIssue } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

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


test('customer contact validation rejects placeholders and invalid email', () => {
    validateCustomerContact('Alice', '0700 123 456', 'alice@example.com');
    for (const phone of ['', '123', 'phone0700123456', '000000000000']) assert.throws(() => validateCustomerContact('Alice', phone));
    assert.throws(() => validateCustomerContact(' ', '0700123456'));
    assert.throws(() => validateCustomerContact('Alice', '0700123456', 'invalid'));
});
test('customer account summary separates debt, payments and cash change', () => {
    const summary = customerAccountSummary([{ total: 100, amountPaid: 0, timestamp: 1 }, { total: 100, amountPaid: 30, timestamp: 2 }, { total: 100, amountPaid: 150, timestamp: 3 }]);
    assert.equal(summary.salesValue, 300);
    assert.equal(summary.received, 130);
    assert.equal(summary.outstanding, 170);
    assert.equal(summary.orders, 3);
    assert.equal(summary.lastPurchase, 3);
    assert.equal(customerAccountSummary([]).lastPurchase, null);
});

 test('legacy customers default to Active without removing explicit restrictions', () => {
    for (const value of [undefined, null, '', '   ']) assert.equal(customerStatus(value), 'Active');
    for (const value of ['Active', 'Inactive', 'Blacklisted']) assert.equal(customerStatus(value), value);
    assert.equal(customerStatus('Unexpected'), 'Unexpected');
 });

test('customer matching catches formatted phones, names and emails without matching blanks', () => {
    const customers = [{ id: 'one', name: 'Alice  Kato', phone: '0700 123 456', email: 'Alice@example.com' }, { id: 'two', name: 'Bob', phone: '0770123456' }];
    assert.equal(findCustomerMatches(customers, { phone: '+256700123456' })[0].phoneMatch, true);
    assert.equal(findCustomerMatches(customers, { phone: '00256700123456' })[0].phoneMatch, true);
    const names = findCustomerMatches(customers, { name: '  ALICE KATO ', phone: '0780123456' });
    assert.equal(names[0].nameMatch, true);
    assert.equal(names[0].phoneMatch, false);
    assert.equal(findCustomerMatches(customers, { email: ' alice@EXAMPLE.COM ' })[0].emailMatch, true);
    assert.deepEqual(findCustomerMatches(customers, {}), []);
    assert.deepEqual(findCustomerMatches(customers, { phone: '0700123456' }, 'one'), []);
});


test('registered checkout accepts existing customers without a phone and uses their account ID', () => {
    const first = { id: 'c1', name: 'MSAWO RASHIDA', phone: '' };
    const second = { id: 'c2', name: 'MSAWO RASHIDA', phone: null, status: 'Active' };
    const customers = [first, second];
    assert.equal(registeredCustomerIssue(first), '');
    assert.equal(registeredCustomerIssue(second), '');
    assert.equal(resolveCheckoutCustomer(customers, { customerId: 'c2', customerName: 'Old name', customerPhone: 'Old phone' }), second);
    assert.equal(resolveCheckoutCustomer(customers, { customerId: 'deleted', customerName: first.name }), null);
    assert.equal(resolveCheckoutCustomer(customers, { customerName: first.name }), null);
    assert.equal(resolveCheckoutCustomer([first], { customerName: ' msawo rashida ' }), first);
});

test('legacy held checkout resolves formatted phones without guessing between duplicate names', () => {
    const customers = [{ id: 'c1', name: 'Alice', phone: '0700123456' }, { id: 'c2', name: 'Alice', phone: '0770123456' }];
    assert.equal(resolveCheckoutCustomer(customers, { customerName: 'Alice', customerPhone: '+256 770 123456' }), customers[1]);
    assert.equal(resolveCheckoutCustomer(customers, { customerName: 'Alice', customerPhone: '0780123456' }), null);
    assert.equal(resolveCheckoutCustomer(customers, {}), null);
});

test('checkout still explains missing selection, incomplete names and account restrictions', () => {
    assert.match(registeredCustomerIssue(null), /Select a registered customer/);
    assert.match(registeredCustomerIssue({ name: 'Alice' }), /Select a registered customer/);
    assert.match(registeredCustomerIssue({ id: 'c1', name: ' ' }), /needs a name/);
    assert.match(registeredCustomerIssue({ id: 'c1', name: 'Alice', status: ' Inactive ' }), /inactive/);
    assert.match(registeredCustomerIssue({ id: 'c1', name: 'Alice', status: ' Blacklisted ' }), /blacklisted/);
    assert.equal(normalizeCustomerPhone(null), '');
    assert.equal(normalizeCustomerPhone(256700123456), '256700123456');
});
