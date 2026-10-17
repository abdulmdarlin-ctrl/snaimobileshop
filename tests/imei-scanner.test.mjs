import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import JsBarcode from 'jsbarcode';
import zxing from '@zxing/library';

const source = await readFile(new URL('../utils/imeiScanner.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { scannedImei, mergeScannedImeis, scanRegion, createLiveImeiTracker } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const first = '490154203237518';
function withCheck(prefix) {
    const sum = [...prefix].reduce((total, digit, index) => { const n = +digit * (index % 2 ? 2 : 1); return total + (n > 9 ? n - 9 : n); }, 0);
    return prefix + (10 - sum % 10) % 10;
}
const second = withCheck('35491079334062');

test('accepts primary IMEI barcodes and validates the check digit', () => {
    assert.equal(scannedImei(first), first);
    assert.equal(scannedImei(` IMEI1: ${first} `), first);
    assert.throws(() => scannedImei(first.slice(0, -1) + '0'), /checksum/);
});
test('rejects totals, secondary-slot labels, placeholder digits and mixed payloads', () => {
    for (const value of ['84012509070173', '000000000000000', '111111111111111', `${first},${second}`, 'https://example.com/' + first]) assert.throws(() => scannedImei(value));
    assert.throws(() => scannedImei(`IMEI2: ${first}`), /IMEI2/);
});
test('fills empty stock slots before increasing quantity and never overwrites an entered IMEI', () => {
    const original = [first, ''];
    assert.deepEqual(mergeScannedImeis(original, 2, [second]), { imeis: [first, second], quantity: 2 });
    assert.deepEqual(original, [first, '']);
    assert.deepEqual(mergeScannedImeis([first], 1, [second]), { imeis: [first, second], quantity: 2 });
    assert.deepEqual(mergeScannedImeis([], 3, [first]), { imeis: [first, '', ''], quantity: 3 });
});
test('refuses duplicates within a scan batch and against existing stock', () => {
    assert.throws(() => mergeScannedImeis([first], 1, [first]), /already entered/);
    assert.throws(() => mergeScannedImeis([], 0, [second, second]), /already entered/);
});
test('scan region stays centered and within portrait and landscape camera frames', () => {
    for (const [w, h] of [[1920, 1080], [1080, 1920], [640, 480]]) {
        const crop = scanRegion(w, h);
        assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= w && crop.y + crop.height <= h);
        assert.equal(crop.x + crop.width / 2, w / 2);
        assert.equal(crop.y + crop.height / 2, h / 2);
    }
});
test('real Code 128 decoder reads a generated IMEI barcode', () => {
    const barcode = {};
    JsBarcode(barcode, first, { format: 'CODE128', displayValue: false });
    const bits = barcode.encodings.map(encoding => encoding.data).join('');
    const width = bits.length * 3 + 60, height = 100;
    const pixels = new Uint8ClampedArray(width * height).fill(255);
    for (let y = 10; y < 90; y++) for (let x = 0; x < bits.length; x++) if (bits[x] === '1') for (let i = 0; i < 3; i++) pixels[y * width + 30 + x * 3 + i] = 0;
    const bitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(new zxing.RGBLuminanceSource(pixels, width, height)));
    const decoder = new zxing.MultiFormatReader();
    decoder.setHints(new Map([[zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.CODE_128]]]));
    assert.equal(scannedImei(decoder.decodeWithState(bitmap).getText()), first);
});

test('live scanning confirms steady readings and adds different phones without restarting', () => {
    const tracker = createLiveImeiTracker();
    assert.equal(tracker.observe(first, 100), null);
    assert.equal(tracker.observe(first, 300), first);
    for (let time = 500; time < 3000; time += 200) assert.equal(tracker.observe(first, time), null);
    assert.equal(tracker.observe(second, 3100), null);
    assert.equal(tracker.observe(second, 3300), second);
    assert.equal(tracker.observe(second, 3500), null);
});
test('a single noisy or stale reading is never accepted as a phone', () => {
    const tracker = createLiveImeiTracker();
    assert.equal(tracker.observe(first, 100), null);
    assert.equal(tracker.observe(second, 300), null);
    assert.equal(tracker.observe(first, 500), null);
    assert.equal(tracker.observe(first, 1801), null);
    assert.throws(() => tracker.observe('84012509070173', 1900));
    assert.equal(tracker.observe(first, 2000), null);
    assert.equal(tracker.observe(first, 2200), first);
});
test('pause and restart discard incomplete readings', () => {
    const tracker = createLiveImeiTracker();
    assert.equal(tracker.observe(first, 100), null);
    tracker.reset();
    assert.equal(tracker.observe(first, 300), null);
    assert.equal(tracker.observe(first, 500), first);
});
