import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../utils/camera.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { requestBarcodeCamera, barcodeCameraCapabilities, cameraErrorMessage, enableBarcodeAutofocus, cameraZoom, resetCameraZoom, waitForCameraFrame } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const failure = name => Object.assign(new Error(name), { name });

test('requests the rear camera and never requests microphone access', async () => {
    const stream = {}, calls = [];
    assert.equal(await requestBarcodeCamera({ getUserMedia: async constraints => { calls.push(constraints); return stream; } }), stream);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].audio, false);
    assert.equal(calls[0].video.facingMode.ideal, 'environment');
});
test('retries unsupported constraints and unavailable saved cameras with a rear-camera fallback', async () => {
    for (const name of ['OverconstrainedError', 'ConstraintNotSatisfiedError', 'NotFoundError']) {
        const calls = [], stream = {};
        const result = await requestBarcodeCamera({ getUserMedia: async constraints => { calls.push(constraints); if (calls.length === 1) throw failure(name); return stream; } }, 'old-camera-id');
        assert.equal(result, stream);
        assert.equal(calls.length, 2);
        assert.equal(calls[0].video.deviceId.exact, 'old-camera-id');
        assert.equal(calls[1].video.deviceId, undefined);
        assert.equal(calls[1].video.facingMode.ideal, 'environment');
    }
});
test('permission denial and busy cameras are reported without repeated permission requests', async () => {
    for (const name of ['NotAllowedError', 'NotReadableError']) {
        let attempts = 0;
        await assert.rejects(requestBarcodeCamera({ getUserMedia: async () => { attempts++; throw failure(name); } }), { name });
        assert.equal(attempts, 1);
    }
    assert.match(cameraErrorMessage(failure('NotAllowedError')), /browser settings/);
    assert.match(cameraErrorMessage(failure('NotReadableError')), /busy/);
});
test('optional torch or zoom capability failures do not prevent camera preview', () => {
    assert.deepEqual(barcodeCameraCapabilities({}), {});
    assert.deepEqual(barcodeCameraCapabilities({ getCapabilities() { throw new Error('Unsupported'); } }), {});
    assert.deepEqual(barcodeCameraCapabilities({ getCapabilities: () => ({ torch: true }) }), { torch: true });
});

test('continuous autofocus is requested only when supported and never prevents scanning', async () => {
    const calls = [];
    const track = { applyConstraints: async value => { calls.push(value); } };
    await enableBarcodeAutofocus(track, {});
    assert.equal(calls.length, 0);
    await enableBarcodeAutofocus(track, { focusMode: ['manual', 'continuous'] });
    assert.equal(calls[0].advanced[0].focusMode, 'continuous');
    await assert.doesNotReject(enableBarcodeAutofocus({ applyConstraints: async () => { throw new Error('Unsupported'); } }, { focusMode: ['continuous'] }));
});

test('preview readiness waits for an actual decoded frame instead of trusting play()', async () => {
    const video = { readyState: 1, videoWidth: 0, videoHeight: 0 };
    let ready = false;
    const waiting = waitForCameraFrame(video, 300).then(() => { ready = true; });
    assert.equal(ready, false);
    video.readyState = 2; video.videoWidth = 1920; video.videoHeight = 1080;
    await waiting;
    assert.equal(ready, true);
});
test('empty camera feeds time out with an actionable preview error', async () => {
    await assert.rejects(waitForCameraFrame({ readyState: 4, videoWidth: 0, videoHeight: 0 }, 10), { name: 'CameraFrameError' });
    assert.match(cameraErrorMessage({ name: 'CameraFrameError' }), /no picture arrived/);
});
test('closing the scanner cancels camera frame readiness without leaving a pending wait', async () => {
    const controller = new AbortController();
    const ready = waitForCameraFrame({ readyState: 0, videoWidth: 0, videoHeight: 0 }, 300, controller.signal);
    controller.abort();
    await assert.rejects(ready, { name: 'AbortError' });
});
test('zoom resets to normal magnification and displays the hardware setting', async () => {
    let actualZoom = 8;
    const capabilities = { zoom: { min: 1, max: 10, step: .1 } };
    const track = { getSettings: () => ({ zoom: actualZoom }), applyConstraints: async value => { actualZoom = value.advanced[0].zoom; } };
    assert.equal(cameraZoom(track, capabilities), 8);
    assert.equal(await resetCameraZoom(track, capabilities), 1);
    const unsupported = { getSettings: () => ({ zoom: 2 }), applyConstraints: async () => { throw new Error('Unsupported'); } };
    assert.equal(await resetCameraZoom(unsupported, capabilities), 2);
});
