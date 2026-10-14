import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(relative, dependencies = {}) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const exports = {};
    vm.runInNewContext(outputText, { exports, require: name => {
        if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
        return dependencies[name];
    }, window: {}, console });
    return exports;
}
const pos = load('../utils/pos.ts');
const validation = load('../utils/validation.ts');
const imeiTools = load('../utils/imei.ts');
const item = (quantity = 1, price = 100) => ({ productId: 'p1', name: 'Phone', quantity, price, originalPrice: 100, total: price * quantity });

test('receipt subtotal, negotiated discount, global discount and tax reconcile', () => {
    const totals = pos.calculateSaleTotals([item(2, 80)], 10, 18);
    assert.equal(totals.subtotal, 200);
    assert.equal(totals.discount, 56);
    assert.equal(totals.tax, 25.92);
    assert.equal(totals.total, 169.92);
});
test('zero tax stays zero and 100% discount is valid', () => {
    assert.equal(pos.calculateSaleTotals([item()], 0, 0).total, 100);
    assert.equal(pos.calculateSaleTotals([item()], 100, 18).total, 0);
});
test('rejects invalid quantity, price, discount and empty carts', () => {
    for (const quantity of [0, -1, 1.5, Infinity, NaN]) assert.throws(() => pos.validateItems([item(quantity)]));
    for (const price of [-1, Infinity, NaN]) assert.throws(() => pos.validateItems([item(1, price)]));
    for (const discount of [-1, 101, NaN]) assert.throws(() => pos.calculateSaleTotals([item()], discount));
    assert.throws(() => pos.validateItems([]));
});
test('cash supports change; noncash must exactly match amount due', () => {
    pos.validatePayment(100, 150, 'Cash');
    pos.validatePayment(100, 100, 'Mobile Money');
    for (const paid of [99, -1, Infinity, NaN]) assert.throws(() => pos.validatePayment(100, paid, 'Cash'));
    assert.throws(() => pos.validatePayment(100, 150, 'Bank'));
});

// In-memory Firestore boundary: verify our transaction adapter's reads, staged writes,
// rollback and idempotency without touching the connected shop database.
function database() {
    let sequence = 0;
    const records = new Map([['products/p1', { name: 'Phone', stockQuantity: 3 }], ['customers/c1', { name: 'Alice', phone: '0700123456', status: 'Active' }]]);
    let failCommit = false;
    const firestore = {
        collection: (_, name) => name,
        doc: (...args) => args.length === 1 ? `${args[0]}/audit-${++sequence}` : `${args[1]}/${args[2]}`,
        runTransaction: async (_, callback) => {
            const writes = [];
            const transaction = {
                get: async ref => {
                    assert.equal(writes.length, 0, 'All reads must precede writes');
                    return { exists: () => records.has(ref), data: () => records.get(ref), id: ref.split('/')[1] };
                },
                update: (ref, data) => writes.push(() => records.set(ref, { ...records.get(ref), ...data })),
                set: (ref, data) => writes.push(() => records.set(ref, data)),
                delete: ref => writes.push(() => records.delete(ref))
            };
            const result = await callback(transaction);
            if (failCommit) throw new Error('Simulated commit failure');
            writes.forEach(write => write());
            return result;
        }
    };
    const { db, safeStringify } = load('../db.ts', { 'firebase/firestore': firestore, './firebaseConfig': { dbInstance: {} }, './types': {}, './utils/pos': pos, './utils/validation': validation, './utils/imei': imeiTools });
    const sale = { id: 's1', receiptNo: 'INV-1', items: [item()], amountPaid: 100, paymentMethod: 'Cash', cashierName: 'cashier', timestamp: 1, customerId: 'c1', customerName: 'Alice', customerPhone: '0700123456' };
    return { db, safeStringify, records, sale, fail: () => { failCommit = true; } };
}
test('checkout and retries deduct stock exactly once', async () => {
    const { db, records, sale } = database();
    await db.commitSale(sale);
    await db.commitSale(sale);
    assert.equal(records.get('products/p1').stockQuantity, 2);
    assert.equal(records.get('sales/s1').total, 100);
    assert.equal([...records.keys()].filter(key => key.startsWith('auditLogs/')).length, 1);
});
test('fresh stock prevents an oversell and leaves no partial sale', async () => {
    const { db, records, sale } = database();
    records.get('products/p1').stockQuantity = 0;
    await assert.rejects(db.commitSale(sale), /Insufficient stock/);
    assert.equal(records.has('sales/s1'), false);
    assert.equal(records.get('products/p1').stockQuantity, 0);
});
test('failed commit leaves sale and stock unchanged', async () => {
    const { db, records, sale, fail } = database();
    fail();
    await assert.rejects(db.commitSale(sale), /Simulated/);
    assert.equal(records.has('sales/s1'), false);
    assert.equal(records.get('products/p1').stockQuantity, 3);
});
test('editing uses stock delta and rejects stale revisions', async () => {
    const { db, records, sale } = database();
    const original = await db.commitSale(sale);
    await db.commitSale({ ...original, items: [item(2)], amountPaid: 200 }, false, 'edit');
    assert.equal(records.get('products/p1').stockQuantity, 1);
    await assert.rejects(db.commitSale(original, false, 'edit'), /changed elsewhere/);
    assert.equal(records.get('products/p1').stockQuantity, 1);
});
test('deletion restores stock only once and keeps an audit snapshot', async () => {
    const { db, records, sale } = database();
    await db.commitSale(sale);
    await db.deleteSale(sale.id, 'admin');
    await db.deleteSale(sale.id, 'admin');
    assert.equal(records.get('products/p1').stockQuantity, 3);
    assert.equal(records.has('sales/s1'), false);
    assert.ok([...records.values()].some(value => value.saleSnapshot?.receiptNo === sale.receiptNo));
});

test('debt and partial sale rules reject contradictory payments', () => {
    pos.validatePayment(100, 0, 'Cash', 'Debt');
    pos.validatePayment(100, 25, 'Mobile Money', 'Partial sale');
    assert.throws(() => pos.validatePayment(100, 1, 'Cash', 'Debt'));
    assert.throws(() => pos.validatePayment(100, 0, 'Cash', 'Partial sale'));
    assert.throws(() => pos.validatePayment(100, 100, 'Bank', 'Partial sale'));
});
test('debt requires an identified customer and deducts inventory once', async () => {
    const { db, records, sale } = database();
    await assert.rejects(db.commitSale({ ...sale, customerId: '', amountPaid: 0, saleType: 'Debt' }), /customer/);
    const debt = await db.commitSale({ ...sale, amountPaid: 0, saleType: 'Debt', customerId: 'c1', customerName: 'Alice', customerPhone: '0700123456' });
    assert.equal(debt.amountDue, 100);
    assert.equal(debt.balance, 100);
    assert.equal(records.get('products/p1').stockQuantity, 2);
});
test('debt progresses through partial to fully paid; payment retry is idempotent', async () => {
    const { db, records, sale } = database();
    await db.commitSale({ ...sale, amountPaid: 0, saleType: 'Debt', customerId: 'c1', customerName: 'Alice', customerPhone: '0700123456' });
    const payment = { id: 'payment1', amount: 40, method: 'Cash', reference: '', timestamp: 2, user: 'cashier' };
    const partial = await db.recordSalePayment(sale.id, payment);
    assert.equal(partial.saleType, 'Partial sale');
    assert.equal(partial.amountDue, 60);
    await db.recordSalePayment(sale.id, payment);
    assert.equal(records.get('sales/s1').amountPaid, 40);
    await assert.rejects(db.recordSalePayment(sale.id, { ...payment, id: 'overpay', amount: 61 }), /exceeds/);
    const paid = await db.recordSalePayment(sale.id, { ...payment, id: 'payment2', amount: 60, method: 'Bank' });
    assert.equal(paid.saleType, 'Cash sale');
    assert.equal(paid.amountDue, 0);
    assert.equal(paid.payments.length, 2);
    assert.equal(records.get('products/p1').stockQuantity, 2);
});
test('failed balance collection leaves the customer balance unchanged', async () => {
    const { db, records, sale, fail } = database();
    await db.commitSale({ ...sale, amountPaid: 20, saleType: 'Partial sale', customerId: 'c1', customerName: 'Alice', customerPhone: '0700123456' });
    fail();
    await assert.rejects(db.recordSalePayment(sale.id, { id: 'p1', amount: 50, method: 'Cash', reference: '', timestamp: 3, user: 'cashier' }));
    assert.equal(records.get('sales/s1').amountDue, 80);
    assert.equal(records.get('sales/s1').amountPaid, 20);
});

test('cash sales require a selected, existing, non-blacklisted customer', async () => {
    const { db, records, sale } = database();
    await assert.rejects(db.commitSale({ ...sale, customerId: '' }), /customer/);
    records.get('customers/c1').status = 'Blacklisted';
    await assert.rejects(db.commitSale(sale), /customer/);
    records.delete('customers/c1');
    await assert.rejects(db.commitSale(sale), /customer/);
    assert.equal(records.get('products/p1').stockQuantity, 3);
});
test('sale editing can replace items and adjusts stock for both products', async () => {
    const { db, records, sale } = database();
    records.set('products/p2', { name: 'Cable', stockQuantity: 5, costPrice: 20 });
    const saved = await db.commitSale(sale);
    await db.commitSale({ ...saved, items: [{ ...item(), productId: 'p2', name: 'Cable' }] }, false, 'edit');
    assert.equal(records.get('products/p1').stockQuantity, 3);
    assert.equal(records.get('products/p2').stockQuantity, 4);
    await assert.rejects(db.commitSale({ ...saved, items: [] }, false, 'edit'), /at least one/);
});
test('shared validation rejects blank required fields and invalid amounts', () => {
    assert.throws(() => validation.validateRecord('products', { name: ' ', sku: 'A' }), /required/);
    assert.throws(() => validation.validateRecord('customers', { name: 'Alice', phone: '' }), /required/);
    assert.throws(() => validation.validateRecord('expenses', { description: 'Fuel', category: 'Travel', amount: NaN }), /valid number/);
    assert.throws(() => validation.validateRecord('products', { stockQuantity: 1.5 }, true), /whole number/);
    assert.throws(() => validation.validateRecord('products', { costPrice: -1 }, true), /non-negative/);
    validation.validateRecord('products', { stockQuantity: 2 }, true);
});

test('IMEIs require 15 digits, distinct units and an exact quantity match', () => {
    imeiTools.validateImeis(['490154203237518'], 1);
    assert.throws(() => imeiTools.validateImeis([], 1));
    assert.throws(() => imeiTools.validateImeis(['123'], 1));
    assert.throws(() => imeiTools.validateImeis(['000000000000000'], 1));
    assert.throws(() => imeiTools.validateImeis(['490154203237518', '490154203237518'], 2));
});
test('phone sale rejects missing/unregistered IMEIs; edit swaps units and deletion restores them', async () => {
    const { db, records, sale } = database();
    const first = '490154203237518', second = '356938035643809';
    records.set('products/p1', { name: 'Phone', type: 'Phone', stockQuantity: 2, imeis: [first, second], costPrice: 50 });
    for (const imei of [first, second]) records.set(`phoneImeis/${imei}`, { productId: 'p1', status: 'Available', saleId: null });
    await assert.rejects(db.commitSale(sale), /IMEI/);
    await assert.rejects(db.commitSale({ ...sale, items: [{ ...item(), imeis: ['123456789012345'] }] }), /inventory/);
    const saved = await db.commitSale({ ...sale, items: [{ ...item(), imeis: [first] }] });
    assert.equal(records.get(`phoneImeis/${first}`).saleId, sale.id);
    assert.equal(records.get('products/p1').imeis.join(), second);
    await assert.rejects(db.commitSale({ ...sale, id: 'another', items: [{ ...item(), imeis: [first] }] }), /inventory/);
    await db.commitSale({ ...saved, items: [{ ...item(), imeis: [second] }] }, false, 'edit');
    assert.equal(records.get(`phoneImeis/${first}`).status, 'Available');
    assert.equal(records.get(`phoneImeis/${second}`).saleId, sale.id);
    await db.deleteSale(sale.id, 'admin');
    assert.equal(records.get('products/p1').stockQuantity, 2);
    assert.equal(records.get(`phoneImeis/${second}`).status, 'Available');
});

test('inventory requires registered IMEIs and rejects cross-product duplicates and sold units', async () => {
    const { db, records } = database();
    records.set('products/p1', { name: 'Phone', sku: 'PHONE', type: 'Phone', stockQuantity: 0, imeis: [] });
    await assert.rejects(db.products.update('p1', { stockQuantity: 1 }), /IMEI/);
    const imei = '490154203237518';
    await db.products.update('p1', { stockQuantity: 1, imeis: [imei] });
    assert.equal(records.get(`phoneImeis/${imei}`).productId, 'p1');
    records.set('products/p2', { name: 'Other phone', sku: 'OTHER', type: 'Phone', stockQuantity: 0, imeis: [] });
    await assert.rejects(db.products.update('p2', { stockQuantity: 1, imeis: [imei] }), /already registered/);
    records.get(`phoneImeis/${imei}`).saleId = 'sold';
    await assert.rejects(db.products.update('p1', { stockQuantity: 1, imeis: [imei] }), /sold/);
});


test('receipts exclude unpaid debt and change, and keep partial balances separate', () => {
    const sale = { total: 100, amountPaid: 0, timestamp: 10, paymentMethod: 'Cash' };
    assert.equal(pos.receivedAmount(sale), 0);
    assert.equal(pos.saleReceipts(sale).length, 0);
    assert.equal(pos.receivedAmount({ ...sale, amountPaid: 30 }), 30);
    assert.equal(pos.outstandingAmount({ ...sale, amountPaid: 30 }), 70);
    assert.equal(pos.receivedAmount({ ...sale, amountPaid: 150 }), 100);
    assert.equal(pos.saleReceipts({ ...sale, amountPaid: 150 })[0].amount, 100);
});
test('later debt collections belong to their collection date and payment method exactly once', () => {
    const sale = { total: 100, amountPaid: 70, timestamp: 10, paymentMethod: 'Cash', payments: [
        { amount: 40, timestamp: 20, method: 'Bank' }
    ] };
    const receipts = pos.saleReceipts(sale);
    assert.equal(receipts.length, 2);
    assert.equal(receipts[0].amount, 30);
    assert.equal(receipts[0].timestamp, 10);
    assert.equal(receipts[1].amount, 40);
    assert.equal(receipts[1].timestamp, 20);
    assert.equal(receipts[1].method, 'Bank');
    assert.equal(receipts.filter(p => p.timestamp >= 20).reduce((sum, p) => sum + p.amount, 0), 40);
    assert.equal(receipts.reduce((sum, p) => sum + p.amount, 0), 70);
    assert.equal(pos.saleReceipts({ ...sale, amountPaid: 40 }).length, 1);
});


test('bulk IMEI entry accepts spreadsheet whitespace and separators without changing serials', () => {
    const values = imeiTools.parseImeis(' 012345678901234\r\n123456789012345,234567890123456;345678901234567\t456789012345678 ');
    assert.equal(values.length, 5);
    assert.equal(values[0], '012345678901234');
    imeiTools.validateImeis(values, 5);
    assert.throws(() => imeiTools.validateImeis(values, 4));
    assert.throws(() => imeiTools.validateImeis(imeiTools.parseImeis('012345678901234,012345678901234'), 2));
});


const purchaseFixture = () => ({ id: 'purchase1', supplierId: 'vendor1', supplierName: 'Vendor', items: [
    { productId: 'p1', productName: 'Accessory', quantity: 2, unitCost: 10, totalCost: 999 },
    { productId: 'p1', productName: 'Accessory', quantity: 3, unitCost: 12, totalCost: 999 }
], totalAmount: 999, status: 'Received', timestamp: 1, receivedBy: 'admin' });
test('purchase receiving groups repeated products, calculates totals and retries once', async () => {
    const { db, records } = database();
    records.set('suppliers/vendor1', { name: 'Vendor' });
    await db.receivePurchase(purchaseFixture());
    await db.receivePurchase(purchaseFixture());
    assert.equal(records.get('products/p1').stockQuantity, 8);
    assert.equal(records.get('purchases/purchase1').totalAmount, 56);
    assert.equal([...records.keys()].filter(key => key.startsWith('stockLogs/')).length, 1);
});
test('failed or invalid purchase leaves stock and purchase records unchanged', async () => {
    const { db, records, fail } = database();
    records.set('suppliers/vendor1', { name: 'Vendor' });
    await assert.rejects(db.receivePurchase({ ...purchaseFixture(), items: [{ ...purchaseFixture().items[0], quantity: 1.5 }] }));
    fail();
    await assert.rejects(db.receivePurchase(purchaseFixture()), /Simulated/);
    assert.equal(records.has('purchases/purchase1'), false);
    assert.equal(records.get('products/p1').stockQuantity, 3);
});
test('consignment checks fresh stock and is idempotent', async () => {
    const { db, records } = database();
    records.set('agents/a1', { name: 'Agent' });
    const loan = { id: 'l1', agentId: 'a1', productId: 'p1', customerName: 'Agent', customerPhone: '0700123456', deviceModel: 'Accessory', imei: 'SERIAL-1', issuedBy: 'admin', timestamp: 1 };
    await db.issueConsignment(loan);
    await db.issueConsignment(loan);
    assert.equal(records.get('products/p1').stockQuantity, 2);
    records.get('products/p1').stockQuantity = 0;
    await assert.rejects(db.issueConsignment({ ...loan, id: 'l2' }), /Insufficient/);
    assert.equal(records.has('loans/l2'), false);
});
test('failed consignment cannot leave a loan without its stock deduction', async () => {
    const { db, records, fail } = database();
    records.set('agents/a1', { name: 'Agent' });
    fail();
    await assert.rejects(db.issueConsignment({ id: 'l1', agentId: 'a1', productId: 'p1', customerName: 'Agent', customerPhone: '0700123456', deviceModel: 'Accessory', imei: 'SERIAL-1', issuedBy: 'admin', timestamp: 1 }), /Simulated/);
    assert.equal(records.has('loans/l1'), false);
    assert.equal(records.get('products/p1').stockQuantity, 3);
});
test('stock adjustment rejects stale forms and logs only committed adjustments', async () => {
    const { db, records } = database();
    const log = { productId: 'p1', previousStock: 3, newStock: 5, reason: 'Count', timestamp: 1, user: 'admin' };
    await db.adjustStock(log);
    await assert.rejects(db.adjustStock({ ...log, newStock: 6 }), /Stock changed/);
    await assert.rejects(db.adjustStock({ ...log, newStock: -1 }), /non-negative/);
    assert.equal(records.get('products/p1').stockQuantity, 5);
    assert.equal([...records.keys()].filter(key => key.startsWith('stockLogs/')).length, 1);
});
test('net item values reconcile invoice discounts and exclude tax', () => {
    const items = [item(1, 100), item(2, 100)];
    const sale = { items, total: 324, tax: 54 };
    assert.equal(pos.itemNetValue(sale, items[0]), 90);
    assert.equal(pos.itemNetValue(sale, items[1]), 180);
    assert.equal(pos.itemNetValue({ items: [], total: 0, tax: 0 }, item()), 0);
});
test('date validation rejects cleared and invalid dates before saving', () => {
    for (const date of [NaN, Infinity, 'invalid', null, 1e20]) assert.throws(() => validation.validateRecord('expenses', { date }, true));
});


test('serialization preserves reused objects and removes only actual circular references', () => {
    const { safeStringify } = database();
    const shared = { value: 1 };
    const value = { first: shared, second: shared };
    assert.deepEqual(JSON.parse(safeStringify(value)), { first: { value: 1 }, second: { value: 1 } });
    value.self = value;
    assert.deepEqual(JSON.parse(safeStringify(value)), { first: { value: 1 }, second: { value: 1 } });
});
test('staff access requires an explicit active profile and valid stored role', () => {
    const types = load('../types.ts');
    const { activeStaffProfile } = load('../utils/staff.ts', { '../types': types });
    for (const value of [null, {}, { username: 'admin', isActive: true }, { username: 'admin', role: 'Admin', isActive: false }, { username: 'admin', role: 'Admin' }, { username: 'admin', isActive: true, role: 'owner' }]) assert.equal(activeStaffProfile(value, 'uid'), null);
    assert.equal(activeStaffProfile({ username: 'admin-name', role: 'Cashier', isActive: true }, 'uid').role, 'Cashier');
    assert.equal(activeStaffProfile({ username: 'staff', role: 'Admin', isActive: true }, 'uid').id, 'uid');
});
