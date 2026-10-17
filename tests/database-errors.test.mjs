import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../utils/databaseErrors.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { isDatabaseQuotaError, databaseErrorMessage } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('cloud quota errors explain the administrator action without confusing browser storage', () => {
    for (const error of [{ code: 'resource-exhausted' }, { code: 'firestore/resource-exhausted' }, new Error('Quota exceeded.'), 'Quota exceeded.']) {
        assert.equal(isDatabaseQuotaError(error), true);
        assert.match(databaseErrorMessage(error, 'Failed'), /Firebase usage and billing/);
    }
    assert.equal(isDatabaseQuotaError({ name: 'QuotaExceededError', message: 'Quota exceeded.' }), false);
    assert.equal(isDatabaseQuotaError({ code: 'permission-denied' }), false);
    assert.equal(databaseErrorMessage(new Error('Insufficient stock'), 'Failed'), 'Insufficient stock');
});
