import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X, Trash2, Flashlight, ImagePlus, Check, Pause, RotateCcw } from 'lucide-react';
import type { BrowserMultiFormatReader } from '@zxing/browser';
import { scannedImei, scanRegion, cameraPreviewRegion, SCAN_GUIDE, createLiveImeiTracker } from '../utils/imeiScanner';
import { confirmAction } from '../utils/dialog';
import { BarcodeWorkerClient } from '../utils/barcodeWorkerClient';
import { requestBarcodeCamera, barcodeCameraCapabilities, enableBarcodeAutofocus, cameraErrorMessage, cameraZoom, resetCameraZoom, waitForCameraFrame, type BarcodeCameraCapabilities } from '../utils/camera';

interface Props { existing: string[]; onApply: (values: string[]) => void; onClose: () => void; }
export default function ImeiScanner({ existing, onApply, onClose }: Props) {
    const video = useRef<HTMLVideoElement>(null), previewCanvas = useRef<HTMLCanvasElement>(null), cropCanvas = useRef<HTMLCanvasElement>(null), panel = useRef<HTMLDivElement>(null);
    const stream = useRef<MediaStream | null>(null), animation = useRef<number | null>(null), startup = useRef<AbortController | null>(null);
    const liveReader = useRef<BarcodeWorkerClient | null>(null), scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null), zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null), zoomRevision = useRef(0);
    const generation = useRef(0), alive = useRef(true), reader = useRef<Promise<BrowserMultiFormatReader> | null>(null);
    const collected = useRef<string[]>([]), last = useRef({ value: '', time: 0 }), tracker = useRef(createLiveImeiTracker());
    const startRef = useRef<() => void>(() => {}), closeRef = useRef<() => void>(() => {});
    const [values, setValues] = useState<string[]>([]), [message, setMessage] = useState('Center one IMEI1 barcode inside the frame.');
    const [error, setError] = useState(''), [phase, setPhase] = useState<'stopped' | 'starting' | 'running' | 'photo'>('stopped');
    const [frameReady, setFrameReady] = useState(false), [mode, setMode] = useState<'live' | 'photo'>('live');
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [device, setDevice] = useState(''), [lastScanned, setLastScanned] = useState('');
    const [torch, setTorch] = useState(false), [capabilities, setCapabilities] = useState<BarcodeCameraCapabilities>({}), [zoom, setZoom] = useState(1);
    const liveCameraSupported = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

    function stop() {
        generation.current++; startup.current?.abort(); startup.current = null; tracker.current.reset();
        liveReader.current?.dispose(); liveReader.current = null;
        if (scanTimer.current !== null) clearTimeout(scanTimer.current); scanTimer.current = null;
        if (zoomTimer.current !== null) clearTimeout(zoomTimer.current); zoomTimer.current = null; zoomRevision.current++;
        if (animation.current !== null) cancelAnimationFrame(animation.current);
        animation.current = null;
        stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
        if (video.current) { video.current.pause(); video.current.srcObject = null; }
        for (const canvas of [previewCanvas.current, cropCanvas.current]) if (canvas) canvas.width = canvas.width;
        if (alive.current) { setPhase('stopped'); setFrameReady(false); setTorch(false); setCapabilities({}); }
    }
    async function close() {
        stop();
        if (collected.current.length && !await confirmAction({ title: 'Discard scanned IMEIs?', message: 'These scans have not been added to the product.', confirmLabel: 'Discard scans', tone: 'danger' })) return;
        onClose();
    }
    closeRef.current = () => { void close(); };
    useEffect(() => {
        alive.current = true;
        const previous = document.activeElement as HTMLElement | null;
        panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
        const keyboard = (event: KeyboardEvent) => {
            if (document.querySelector('.confirmation-layer')) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); }
            if (event.key !== 'Tab') return;
            const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') || []).filter(el => el.getClientRects().length);
            const first = controls[0], end = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); end?.focus(); }
            else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); first?.focus(); }
        };
        const visibility = () => { if (document.hidden) stop(); };
        document.addEventListener('keydown', keyboard, true); document.addEventListener('visibilitychange', visibility);
        if (liveCameraSupported) startRef.current();
        return () => { alive.current = false; stop(); document.removeEventListener('keydown', keyboard, true); document.removeEventListener('visibilitychange', visibility); if (previous?.isConnected) previous.focus(); };
    }, []);
    function decoder() {
        if (!reader.current) reader.current = Promise.all([import('@zxing/browser'), import('@zxing/library')]).then(([browser, library]) => {
            const hints = new Map();
            hints.set(library.DecodeHintType.POSSIBLE_FORMATS, [library.BarcodeFormat.CODE_128, library.BarcodeFormat.CODE_39, library.BarcodeFormat.ITF, library.BarcodeFormat.EAN_13]);
            hints.set(library.DecodeHintType.TRY_HARDER, true);
            return new browser.BrowserMultiFormatReader(hints);
        }).catch(error => { reader.current = null; throw error; });
        return reader.current;
    }
    function accept(raw: string) {
        if (last.current.value === raw && Date.now() - last.current.time < 2000) return;
        last.current = { value: raw, time: Date.now() };
        try {
            const value = scannedImei(raw);
            if (existing.some(item => item.trim() === value) || collected.current.includes(value)) { setMessage(`Already entered: ${value}. Move to the next phone.`); setError(''); return; }
            collected.current = [...collected.current, value]; setValues(collected.current); setLastScanned(value);
            setMessage(`Added ${value}. Move to the next IMEI1 barcode.`); setError('');
            try { navigator.vibrate?.(70); } catch { /* Optional feedback. */ }
        } catch (error) { setError((error as Error).message); }
    }
    async function start(requestedDevice = device) {
        stop(); setError('');
        if (!liveCameraSupported) { setError('Live video scanning needs the HTTPS website and camera permission.'); return; }
        const run = generation.current, controller = new AbortController(); startup.current = controller; setPhase('starting');
        try {
            const media = await requestBarcodeCamera(navigator.mediaDevices, requestedDevice);
            if (!alive.current || run !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
            stream.current = media;
            const track = media.getVideoTracks()[0], preview = video.current!;
            track.addEventListener('ended', () => { if (alive.current && run === generation.current) { stop(); setError('The camera stopped. Tap Restart camera to reconnect.'); } }, { once: true });
            // Expose camera switching even if this camera never produces a picture.
            navigator.mediaDevices.enumerateDevices?.().then(list => { if (alive.current && run === generation.current) setDevices(list.filter(item => item.kind === 'videoinput')); }).catch(() => {});
            preview.muted = true; preview.playsInline = true; preview.srcObject = media;
            const playing = preview.play();
            await Promise.all([playing, waitForCameraFrame(preview, 10000, controller.signal)]);
            if (!alive.current || run !== generation.current) return;
            const caps = barcodeCameraCapabilities(track); setCapabilities(caps);
            void enableBarcodeAutofocus(track, caps);
            const actualZoom = await resetCameraZoom(track, caps);
            if (!alive.current || run !== generation.current) return;
            setZoom(actualZoom);
            const mainCanvas = previewCanvas.current!, scanCanvas = cropCanvas.current!;
            const mainContext = mainCanvas.getContext('2d', { alpha: false }), scanContext = scanCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
            if (!mainContext || !scanContext) throw new Error('Camera preview is unavailable.');
            let painted = false, lastPaint = 0;
            // Preview rendering never waits for barcode decoding or copies full camera resolution.
            const paint = (now: number) => {
                if (!alive.current || run !== generation.current) return;
                animation.current = requestAnimationFrame(paint);
                if (now - lastPaint < 30 || preview.readyState < 2 || !preview.videoWidth || !preview.videoHeight) return;
                lastPaint = now;
                try {
                    const visible = cameraPreviewRegion(preview.videoWidth, preview.videoHeight);
                    const width = Math.max(4, Math.floor(Math.min(640, visible.width) / 4) * 4), height = width * 3 / 4;
                    if (mainCanvas.width !== width || mainCanvas.height !== height) { mainCanvas.width = width; mainCanvas.height = height; }
                    mainContext.drawImage(preview, visible.x, visible.y, visible.width, visible.height, 0, 0, width, height);
                    if (!painted) { painted = true; setFrameReady(true); }
                } catch {
                    stop(); setError('The camera picture could not be displayed. Restart the camera or choose another rear camera.');
                }
            };
            animation.current = requestAnimationFrame(paint);
            let background: BarcodeWorkerClient;
            try { background = new BarcodeWorkerClient(new Worker(new URL('../workers/imeiDecoder.worker.ts', import.meta.url), { type: 'module' })); }
            catch { throw Object.assign(new Error('The background barcode reader is unavailable. Try another browser or use Photo.'), { name: 'BarcodeWorkerError' }); }
            liveReader.current = background;
            try { await background.ready; }
            catch (error) { throw Object.assign(error as Error, { name: 'BarcodeWorkerError' }); }
            if (!alive.current || run !== generation.current) return;
            setPhase('running'); setMessage('Live picture ready. Keep one IMEI1 barcode centered between the corners.');
            const readFrame = async () => {
                if (!alive.current || run !== generation.current) return;
                try {
                    if (preview.readyState >= 2 && preview.videoWidth && preview.videoHeight && !background.busy) {
                        // Draw the guide's sensor crop directly: preserve barcode detail without copying the full frame.
                        const crop = scanRegion(preview.videoWidth, preview.videoHeight), scale = Math.min(1, 960 / crop.width);
                        const width = Math.max(1, Math.round(crop.width * scale)), height = Math.max(1, Math.round(crop.height * scale));
                        if (scanCanvas.width !== width || scanCanvas.height !== height) { scanCanvas.width = width; scanCanvas.height = height; }
                        scanContext.drawImage(preview, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
                        const raw = await background.decode(scanContext.getImageData(0, 0, width, height));
                        if (!alive.current || run !== generation.current) return;
                        if (raw) { try { const confirmed = tracker.current.observe(raw); if (confirmed) accept(confirmed); } catch { accept(raw); } }
                    }
                } catch (error) {
                    if (alive.current && run === generation.current) { stop(); setError((error as Error).message || 'Barcode reading stopped. Restart the scanner.'); }
                    return;
                }
                // Schedule from completion, not a fixed interval. Slow phones cannot accumulate a scan backlog.
                if (alive.current && run === generation.current) scanTimer.current = setTimeout(() => { void readFrame(); }, 220);
            };
            void readFrame();
        } catch (error) {
            if (!alive.current || run !== generation.current) return;
            stop(); setError((error as Error).name === 'BarcodeWorkerError' ? (error as Error).message : cameraErrorMessage(error));
        }
    }
    startRef.current = () => { void start(); };
    async function photo(file?: File) {
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) { setError('Choose a close-up photo smaller than 20 MB.'); return; }
        stop(); const run = generation.current; setPhase('photo'); setError('');
        const url = URL.createObjectURL(file);
        try { const codeReader = await decoder(); const result = await codeReader.decodeFromImageUrl(url); if (alive.current && run === generation.current) accept(result.getText()); }
        catch { if (alive.current && run === generation.current) setError('No readable barcode found. Retake a sharp close-up of one IMEI1 barcode with the barcode running left to right and a white margin at both ends.'); }
        finally { URL.revokeObjectURL(url); if (alive.current && run === generation.current) setPhase('stopped'); }
    }
    async function cameraSetting(setting: { torch?: boolean; zoom?: number }, revision = zoomRevision.current) {
        const track = stream.current?.getVideoTracks()[0], run = generation.current;
        if (!track) return;
        try {
            await track.applyConstraints({ advanced: [setting as MediaTrackConstraintSet] });
            if (!alive.current || run !== generation.current) return;
            if (setting.torch !== undefined) setTorch(setting.torch);
            if (setting.zoom !== undefined && revision === zoomRevision.current) setZoom(cameraZoom(track, capabilities));
        } catch { if (alive.current && run === generation.current) setError('This camera could not apply that setting. Continue scanning without it.'); }
    }
    function queueZoom(value: number) {
        setZoom(value);
        const revision = ++zoomRevision.current;
        if (zoomTimer.current !== null) clearTimeout(zoomTimer.current);
        zoomTimer.current = setTimeout(() => { zoomTimer.current = null; void cameraSetting({ zoom: value }, revision); }, 150);
    }
    const zoomRange = capabilities.zoom && capabilities.zoom.max > capabilities.zoom.min ? capabilities.zoom : null;
    return createPortal(<div className="imei-scanner-layer"><div ref={panel} className="imei-scanner-panel" role="dialog" aria-modal="true" aria-labelledby="imei-scanner-title">
        <header><div><h2 id="imei-scanner-title">Scan phone IMEIs</h2><p>Position one IMEI1 barcode in the center</p></div><button type="button" onClick={() => void close()} aria-label="Close IMEI scanner"><X size={22} /></button></header>
        <div className="imei-scanner-body">
            <div className="imei-scan-modes" aria-label="Barcode scanning method"><button type="button" aria-pressed={mode === 'live'} onClick={() => { setMode('live'); if (phase !== 'running' && phase !== 'starting') void start(); }}><Camera size={17} /> Live scanner</button><button type="button" aria-pressed={mode === 'photo'} onClick={() => { stop(); setMode('photo'); }}><ImagePlus size={17} /> Photo</button></div>
            <div className="imei-camera-preview" data-scanning={phase === 'running'} data-picture={frameReady}>
                <video ref={video} muted playsInline autoPlay aria-hidden="true" />
                <canvas ref={previewCanvas} className="imei-camera-surface" aria-label="Live rear camera picture for barcode positioning" />
                <div className="imei-camera-shade" aria-hidden="true" />
                <div className="imei-camera-guide" style={{ left: `${SCAN_GUIDE.left * 100}%`, top: `${SCAN_GUIDE.top * 100}%`, width: `${SCAN_GUIDE.width * 100}%`, height: `${SCAN_GUIDE.height * 100}%` }} aria-hidden="true"><i /><i /><i /><i /></div>
                <span className="imei-live-badge">{phase === 'running' && frameReady ? 'LIVE CAMERA' : phase === 'starting' ? 'CONNECTING' : 'PAUSED'}<strong>{values.length} scanned</strong></span>
                {!frameReady && <div className="imei-preview-placeholder"><Camera size={30} /><span>{phase === 'starting' ? 'Waiting for camera picture...' : 'Start the camera to position your barcode'}</span></div>}
                <span className="imei-camera-caption">{frameReady ? 'Keep the complete barcode inside the corners' : 'Your camera picture will appear here'}</span>
            </div>
            <div className="imei-crop-inspector" data-ready={frameReady}><div><span>Barcode area being read</span><small>IMEI1 only</small></div><canvas ref={cropCanvas} aria-label="Exact center crop used for barcode decoding" /></div>
            {!liveCameraSupported && <p className="imei-camera-notice">Live scanning needs the HTTPS website and camera permission. Open the secure shop address on your phone.</p>}
            {mode === 'live' ? <div className="imei-camera-actions"><button type="button" disabled={!liveCameraSupported || phase === 'photo'} onClick={() => phase === 'running' || phase === 'starting' ? stop() : void start()}>{phase === 'running' || phase === 'starting' ? <><Pause size={17} /> Pause</> : <><Camera size={17} /> Start camera</>}</button><button type="button" disabled={!liveCameraSupported || phase === 'photo'} onClick={() => void start()}><RotateCcw size={17} /> Restart camera</button>{phase === 'running' && capabilities.torch && <button type="button" aria-pressed={torch} onClick={() => void cameraSetting({ torch: !torch })}><Flashlight size={17} /> Light {torch ? 'off' : 'on'}</button>}</div> : <div className="imei-camera-actions">
                <label className={phase === 'photo' ? 'disabled' : ''}><Camera size={17} /> Take barcode photo<input aria-label="Take barcode photo with phone camera" type="file" accept="image/*" capture="environment" disabled={phase === 'photo'} onChange={event => { void photo(event.target.files?.[0]); event.target.value = ''; }} /></label>
                <label className={phase === 'photo' ? 'disabled' : ''}><ImagePlus size={17} /> Choose photo<input aria-label="Choose existing barcode photo" type="file" accept="image/*" disabled={phase === 'photo'} onChange={event => { void photo(event.target.files?.[0]); event.target.value = ''; }} /></label>
            </div>}
            {mode === 'live' && devices.length > 1 && <label className="imei-camera-select">Camera<select value={device} disabled={phase === 'starting' || phase === 'photo'} onChange={event => { setDevice(event.target.value); void start(event.target.value); }}><option value="">Automatic rear camera</option>{devices.map((item, index) => <option key={item.deviceId} value={item.deviceId}>{item.label || `Camera ${index + 1}`}</option>)}</select></label>}
            {phase === 'running' && zoomRange && <div className="imei-zoom-control"><label>Zoom <output>{zoom.toFixed(1)}x</output><input aria-label="Camera zoom" type="range" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step || .1} value={zoom} onChange={event => queueZoom(Number(event.target.value))} /></label><button type="button" onClick={() => queueZoom(Math.min(zoomRange.max, Math.max(zoomRange.min, 1)))}>Reset</button></div>}
            {lastScanned && <div className="imei-last-scan"><Check size={18} /><span>Last added <strong>{lastScanned}</strong></span></div>}
            <p className="imei-scan-status" role="status">{message}</p>{error && <p className="imei-scan-error" role="alert">{error}</p>}
            <div className="imei-scan-list"><h3>{values.length} scanned for review</h3><p>Use one primary IMEI per phone. IMEI2 belongs to the same phone.</p>{values.map(value => <div key={value}><span>{value}</span><button type="button" aria-label={`Remove IMEI ${value}`} onClick={() => { collected.current = collected.current.filter(item => item !== value); setValues(collected.current); tracker.current.reset(); last.current = { value: '', time: 0 }; if (lastScanned === value) setLastScanned(''); }}><Trash2 size={17} /></button></div>)}</div>
        </div>
        <footer><p>Scans are saved to inventory when you save the product.</p><button type="button" disabled={!values.length} onClick={() => { stop(); try { onApply(collected.current); } catch (error) { setError((error as Error).message); } }}><Check size={18} /> Add {values.length} IMEIs to product</button></footer>
    </div></div>, document.body);
}
