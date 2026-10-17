import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import test from 'node:test';
import ts from 'typescript';
import JsBarcode from 'jsbarcode';

const source = await readFile(new URL('../utils/barcodeWorkerClient.ts', import.meta.url), 'utf8');
const transpile = (source, module = ts.ModuleKind.ESNext) => ts.transpileModule(source, { compilerOptions: { module, target: ts.ScriptTarget.ES2022 } }).outputText;
const { BarcodeWorkerClient } = await import(`data:text/javascript;base64,${Buffer.from(transpile(source)).toString('base64')}`);
class FakeWorker {
    messages = []; terminated = false;
    postMessage(message, transfer) { this.messages.push({ message, transfer }); }
    send(data) { this.onmessage?.({ data }); }
    terminate() { this.terminated = true; }
}
const frame = () => ({ width: 2, height: 1, data: new Uint8ClampedArray(8) });

test('slow decoding never queues camera frames and transfers pixels without cloning', async () => {
    const worker = new FakeWorker(), client = new BarcodeWorkerClient(worker);
    worker.send({ type: 'ready' }); await client.ready;
    const image = frame(), pending = client.decode(image);
    for (let i = 0; i < 20; i++) assert.equal(await client.decode(frame()), null);
    assert.equal(worker.messages.length, 1);
    assert.equal(worker.messages[0].transfer[0], image.data.buffer);
    worker.send({ type: 'result', id: 999, text: 'old result' });
    assert.equal(client.busy, true);
    worker.send({ type: 'result', id: 1, text: '490154203237518' });
    assert.equal(await pending, '490154203237518');
    assert.equal(client.busy, false);
    client.dispose();
});
test('a stalled decoder is terminated and reports recovery instead of hanging', async () => {
    const worker = new FakeWorker(), client = new BarcodeWorkerClient(worker, 20);
    worker.send({ type: 'ready' }); await client.ready;
    await assert.rejects(client.decode(frame()), /stalled/);
    assert.equal(worker.terminated, true);
    assert.equal(client.busy, false);
});
test('closing during a scan clears pending work and ignores late results', async () => {
    const worker = new FakeWorker(), client = new BarcodeWorkerClient(worker);
    worker.send({ type: 'ready' }); await client.ready;
    const callback = worker.onmessage, pending = client.decode(frame());
    client.dispose();
    callback({ data: { type: 'result', id: 1, text: '490154203237518' } });
    assert.equal(await pending, null);
    assert.equal(worker.terminated, true);
    await assert.rejects(client.decode(frame()), /not ready/);
});
test('worker startup failure and browser worker errors release the scanner', async () => {
    const neverStarts = new FakeWorker(), startup = new BarcodeWorkerClient(neverStarts, 100, 20);
    await assert.rejects(startup.ready, /load/);
    assert.equal(neverStarts.terminated, true);
    const worker = new FakeWorker(), client = new BarcodeWorkerClient(worker);
    worker.send({ type: 'ready' }); await client.ready;
    const pending = client.decode(frame());
    worker.onerror({ preventDefault() {} });
    await assert.rejects(pending, /background barcode reader stopped/);
    assert.equal(worker.terminated, true);
});
test('closing during worker loading cancels startup immediately', async () => {
    const worker = new FakeWorker(), client = new BarcodeWorkerClient(worker);
    client.dispose();
    await assert.rejects(client.ready, { name: 'AbortError' });
    assert.equal(worker.terminated, true);
});
test('failed pixel transfers reject the scan and terminate the broken worker', async () => {
    const worker = new FakeWorker(), client = new BarcodeWorkerClient(worker);
    worker.send({ type: 'ready' }); await client.ready;
    worker.postMessage = () => { throw new Error('Transfer failed'); };
    await assert.rejects(client.decode(frame()), /could not be sent/);
    assert.equal(worker.terminated, true);
});
function barcodeImage(value, format = 'CODE128') {
    const barcode = {};
    JsBarcode(barcode, value, { format, displayValue: false });
    const bits = barcode.encodings.map(part => part.data).join('');
    const width = bits.length * 3 + 60, height = 100;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 10; y < 90; y++) for (let x = 0; x < bits.length; x++) if (bits[x] === '1') for (let i = 0; i < 3; i++) {
        const offset = (y * width + 30 + x * 3 + i) * 4;
        data[offset] = data[offset + 1] = data[offset + 2] = 0;
    }
    return { width, height, data };
}
test('production worker reads real barcode crops off the main thread and continues after unreadable frames', async () => {
    const workerSource = await readFile(new URL('../workers/imeiDecoder.worker.ts', import.meta.url), 'utf8');
    const worker = new Worker(`const { parentPort } = require('node:worker_threads');
        global.self = { postMessage: data => parentPort.postMessage(data) };
        parentPort.on('message', data => self.onmessage({ data }));
        ${transpile(workerSource, ts.ModuleKind.CommonJS)}`, { eval: true });
    const channel = { onmessage: null, onerror: null, onmessageerror: null,
        postMessage: (message, transfer) => worker.postMessage(message, transfer), terminate: () => { void worker.terminate(); } };
    worker.on('message', data => channel.onmessage?.({ data }));
    worker.on('error', () => channel.onerror?.({ preventDefault() {} }));
    const client = new BarcodeWorkerClient(channel);
    try {
        await client.ready;
        const first = barcodeImage('490154203237518');
        const result = client.decode(first);
        assert.equal(first.data.byteLength, 0, 'pixel buffer is transferred to the worker');
        assert.equal(await result, '490154203237518');
        assert.equal(await client.decode({ width: 600, height: 100, data: new Uint8ClampedArray(600 * 100 * 4).fill(255) }), null);
        assert.equal(await client.decode(barcodeImage('354910793340623', 'CODE39')), '354910793340623');
    } finally { client.dispose(); }
});
