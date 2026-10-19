import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../utils/databaseReadCache.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { createDatabaseReadCache } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('concurrent requests share one cloud read; cached values expire and explicit refresh stays fresh', async () => {
    let now = 0, reads = 0;
    const cache = createDatabaseReadCache(() => now);
    const load = async () => ({ count: ++reads });
    const [first, second] = await Promise.all([cache.read('products:all', load), cache.read('products:all', load)]);
    assert.equal(reads, 1);
    first.count = 999;
    assert.equal(second.count, 1);
    assert.equal((await cache.read('products:all', load)).count, 1);
    assert.equal((await cache.read('products:all', load, { fresh: true })).count, 2);
    now = 30_001;
    assert.equal((await cache.read('products:all', load)).count, 3);
});
test('a late response after logout or a committed write cannot populate a new cache session', async () => {
    const cache = createDatabaseReadCache();
    let complete;
    const pending = cache.read('customers:all', () => new Promise(resolve => { complete = resolve; }));
    await Promise.resolve();
    cache.invalidate();
    cache.seed('customers:all', [{ name: 'New session' }]);
    complete([{ name: 'Old session' }]);
    await pending;
    const records = await cache.read('customers:all', async () => { throw new Error('Unnecessary read'); });
    assert.equal(records[0].name, 'New session');
});
test('errors are never cached as empty results and the same request can recover after quota restoration', async () => {
    const cache = createDatabaseReadCache();
    const quota = Object.assign(new Error('Quota exceeded'), { code: 'resource-exhausted' });
    await assert.rejects(cache.read('sales:all', async () => { throw quota; }), { code: 'resource-exhausted' });
    assert.deepEqual(await cache.read('sales:all', async () => [{ id: 'saved-sale' }]), [{ id: 'saved-sale' }]);
});
