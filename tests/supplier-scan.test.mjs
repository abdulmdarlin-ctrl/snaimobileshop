import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
function load(file, dependencies = {}) {
    const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const exports = {};
    vm.runInNewContext(outputText, { exports, require: name => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; }, console });
    return exports;
}
const scanner = load('../utils/imeiScanner.ts'), imei = load('../utils/imei.ts');
const { addScannedSaleItem, invoiceScanStock } = load('../utils/scanToSell.ts', { './imeiScanner': scanner, './imei': imei });
const { parseSupplierImeis } = scanner;
const first = '490154203237518', second = '354910793340623';
const list = value => [...value.imeis];
test('supplier Total payloads accept plain and packed primary IMEI lists', () => {
    for (const payload of [`${first}\n${second}`, `${first},${second}`, `${first}${second}`]) assert.deepEqual(list(parseSupplierImeis(payload)), [first, second]);
});
test('supplier labels and CSV exclude IMEI2 without counting another phone', () => {
    for (const payload of [`IMEI1: ${first}\nIMEI2: ${second}\nIMEI1: ${second}`, `IMEI1,IMEI2\n${first},${second}\n${second},${first}`]) {
        const batch = parseSupplierImeis(payload);
        assert.deepEqual(list(batch), [first, second]);
        assert.ok(batch.excludedSecondary >= 1); assert.equal(batch.labelled, true);
    }
});
test('JSON supplier records read only IMEI fields and ignore unrelated identifiers', () => {
    const batch = parseSupplierImeis(JSON.stringify({ references: [first], devices: [{ imei1: first, imei2: second }, { imei: second }] }));
    assert.deepEqual(list(batch), [first, second]); assert.equal(batch.excludedSecondary, 1);
    assert.deepEqual(list(parseSupplierImeis(JSON.stringify([first, second]))), [first, second]);
});
test('references, malformed serials and duplicate batches cannot become inventory', () => {
    assert.throws(() => parseSupplierImeis('84012509070173'), /reference/);
    assert.throws(() => parseSupplierImeis(`${first},${first}`), /repeats/);
    assert.throws(() => parseSupplierImeis(`IMEI1: 12345678901234\nIMEI1: ${first}`), /15-digit/);
    assert.throws(() => parseSupplierImeis(`IMEI1: missing\nIMEI1: ${first}`), /15-digit/);
    assert.throws(() => parseSupplierImeis(JSON.stringify({ orderId: first })), /No primary/);
    assert.throws(() => parseSupplierImeis(`${first},${second.slice(0, -1)}0`), /checksum/);
    assert.throws(() => parseSupplierImeis('https://supplier.invalid/list/' + first), /supported IMEI list/);
});
test('large Total codes can receive stable confirmation without the unit scanner time limit', () => {
    const tracker = scanner.createLiveImeiTracker(raw => (parseSupplierImeis(raw), raw), 10000);
    const payload = `${first}\n${second}`;
    assert.equal(tracker.observe(payload, 100), null); assert.equal(tracker.observe(payload, 3000), payload);
});
const phone = { id: 'phone', type: 'Phone', name: 'Phone', stockQuantity: 2, selling_price: 100, imeis: [first, second] };
const accessory = { id: 'case', type: 'Accessory', name: 'Case', stockQuantity: 2, selling_price: 10 };
const price = product => product.selling_price;
test('scanning an available phone records the exact unit and rejects duplicate phone scans', () => {
    const firstScan = addScannedSaleItem([phone], [], first, price);
    assert.equal(firstScan.cart[0].quantity, 1); assert.deepEqual([...firstScan.cart[0].imeis], [first]);
    assert.throws(() => addScannedSaleItem([phone], firstScan.cart, first, price), /already in/);
    const secondScan = addScannedSaleItem([phone], firstScan.cart, second, price);
    assert.equal(secondScan.cart[0].quantity, 2); assert.equal(secondScan.cart[0].total, 200);
    assert.deepEqual([...secondScan.cart[0].imeis], [first, second]);
    assert.equal(firstScan.cart[0].quantity, 1, 'existing cart is immutable');
});
test('an IMEI fills a manually selected unassigned phone instead of doubling quantity', () => {
    const draft = [{ productId: phone.id, name: phone.name, price: 100, total: 100, quantity: 1 }];
    const serial = addScannedSaleItem([phone], draft, first, price);
    assert.equal(serial.cart[0].quantity, 1); assert.deepEqual([...serial.cart[0].imeis], [first]);
});
test('only available unique phone IMEIs can be scanned for sale', () => {
    assert.throws(() => addScannedSaleItem([accessory], [], 'case-01', price), /15/);
    assert.throws(() => addScannedSaleItem([{ ...phone, imeis: [] }], [], first, price), /No available/);
    assert.throws(() => addScannedSaleItem([phone, { ...phone, id: 'other' }], [], first, price), /multiple/);
    assert.throws(() => addScannedSaleItem([phone], [], first, () => NaN), /price/);
    assert.throws(() => addScannedSaleItem([phone], [], `${first}\n${second}`, price), /15|one/);
    assert.throws(() => addScannedSaleItem([{ ...phone, stockQuantity: 0 }], [], first, price, true), /Only 0/);
});


test('invoice scans include its own sold units without mutating stock or adding a phone twice', () => {
    const sold = '490154203237518', available = '356938035643809';
    const products = [{ id: 'p1', name: 'Phone', type: 'Phone', stockQuantity: 1, selling_price: 100, imeis: [available] }];
    const original = [{ productId: 'p1', name: 'Phone', quantity: 1, price: 90, total: 90, imeis: [sold] }];
    const pool = invoiceScanStock(products, original);
    assert.equal(products[0].stockQuantity, 1);
    assert.deepEqual(products[0].imeis, [available]);
    assert.equal(pool[0].stockQuantity, 2);
    const added = addScannedSaleItem(pool, original, available, () => 100);
    assert.equal(added.cart[0].quantity, 2);
    assert.equal(added.cart[0].price, 90);
    assert.throws(() => addScannedSaleItem(pool, added.cart, available, () => 100), /already in/);
    const restored = addScannedSaleItem(pool, [], sold, () => 100);
    assert.equal(restored.cart[0].imeis[0], sold);
    assert.equal(original[0].quantity, 1);
});
