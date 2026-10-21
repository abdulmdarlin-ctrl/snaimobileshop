import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../utils/productSearch.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const exports = {};
vm.runInNewContext(outputText, { exports });
const { indexProducts, searchProducts } = exports;

test('invoice product search finds partial names, brands and categories without changing inventory', () => {
    const products = [{ id: 'p1', name: 'T528 NEW', brand: 'Itel', category: 'Phones', stockQuantity: 2 }, { id: 'p2', name: 'T528 OLD', brand: 'Itel', category: 'Phones', stockQuantity: 0 }, { id: 'p3', name: 'Phone cover', brand: 'Samsung', category: 'Accessories', stockQuantity: 10 }];
    const index = indexProducts(products);
    assert.deepEqual(Array.from(searchProducts(index, 't528'), product => product.id), ['p1', 'p2']);
    assert.equal(searchProducts(index, 'ITEL new')[0].id, 'p1');
    assert.equal(searchProducts(index, 'accessor')[0].id, 'p3');
    assert.equal(searchProducts(index, 'samsung')[0].id, 'p3');
    assert.equal(searchProducts(index, 'not in inventory').length, 0);
    assert.equal(products[0].stockQuantity, 2);
    assert.equal(products[1].stockQuantity, 0, 'search does not change stock or invoice availability rules');
});
test('empty searches show a bounded browse list and unsaved products cannot be selected', () => {
    const products = Array.from({ length: 10000 }, (_, id) => ({ id: String(id), name: `Phone ${id}` }));
    const index = indexProducts([{ name: 'Unsaved product' }, ...products]);
    assert.equal(searchProducts(index, '').length, 8);
    assert.equal(searchProducts(index, 'phone').length, 8);
    assert.equal(searchProducts(index, 'phone 9999')[0].id, '9999');
    assert.equal(searchProducts(index, 'unsaved').length, 0);
});
