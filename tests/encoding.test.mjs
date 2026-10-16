import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['node_modules', '.git', 'dist', '.codex', '.agents']);
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.json']);
function* sourceFiles(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (excluded.has(entry.name)) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) yield* sourceFiles(path);
        else if (entry.isFile() && extensions.has(extname(path))) yield path;
    }
}

test('application source is valid UTF-8 without replacement characters', () => {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    for (const path of sourceFiles(root)) {
        const label = relative(root, path);
        let text;
        assert.doesNotThrow(() => { text = decoder.decode(readFileSync(path)); }, `${label} must use UTF-8 encoding`);
        assert.ok(!text.includes(String.fromCodePoint(0xfffd)), `${label} contains a broken replacement character`);
    }
});
