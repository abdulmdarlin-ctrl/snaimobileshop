import { activateDialog } from '../utils/dialogSurface';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X, Trash2, Flashlight, ImagePlus, Check, Pause, RotateCcw } from 'lucide-react';
import type { BrowserMultiFormatReader } from '@zxing/browser';
import { scannedImei, scanRegion, SCAN_GUIDE, createLiveImeiTracker, nextScanDelay, SHEET_SCAN_GUIDE, parseSupplierImeis, normalizeScannedSaleCode } from '../utils/imeiScanner';
import { confirmAction } from '../utils/dialog';
import { BarcodeWorkerClient } from '../utils/barcodeWorkerClient';
import { requestBarcodeCamera, barcodeCameraCapabilities, enableBarcodeAutofocus, cameraErrorMessage, cameraZoom, resetCameraZoom, waitForCameraFrame, type BarcodeCameraCapabilities } from '../utils/camera';

interface Props { existing?: string[]; onApply?: (values: string[]) => void; onClose: () => void; purpose?: 'inventory' | 'sale'; initialTarget?: 'unit' | 'sheet'; onSaleScan?: (code: string) => string; }
export default function ImeiScanner({ existing = [], onApply, onClose, purpose = 'inventory', initialTarget = 'unit', onSaleScan }: Props) {
    const video = useRef<HTMLVideoElement>(null), cropCanvas = useRef<HTMLCanvasElement>(null), cropInspector = useRef<HTMLDetailsElement>(null), panel = useRef<HTMLDivElement>(null);
    const stream = useRef<MediaStream | null>(null), startup = useRef<AbortController | null>(null);
    const liveReader = useRef<BarcodeWorkerClient | null>(null), scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null), zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null), zoomRevision = useRef(0);
    const generation = useRef(0), alive = useRef(true), reader = useRef<Promise<BrowserMultiFormatReader> | null>(null);
    const collected = useRef<string[]>([]), last = useRef({ value: '', time: 0 }), tracker = useRef(createLiveImeiTracker());
    const startRef = useRef<() => void>(() => {}), closeRef = useRef<() => void>(() => {});
    const [values, setValues] = useState<string[]>([]), [message, setMessage] = useState('Center one IMEI1 barcode inside the frame.');
    const [error, setError] = useState(''), [phase, setPhase] = useState<'stopped' | 'starting' | 'running' | 'photo'>('stopped');
    const [frameReady, setFrameReady] = useState(false), [mode, setMode] = useState<'live' | 'photo'>('live');
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [device, setDevice] = useState(''), [lastScanned, setLastScanned] = useState('');
    const [torch, setTorch] = useState(false), [capabilities, setCapabilities] = useState<BarcodeCameraCapabilities>({}), [zoom, setZoom] = useState(1);
    const [target, setTarget] = useState<'unit' | 'sheet'>(initialTarget), [batchReview, setBatchReview] = useState(false), [reviewed, setReviewed] = useState(false);
    const [saleLabels, setSaleLabels] = useState<string[]>([]);
    const previousTarget = useRef(target);
    const isSale = purpose === 'sale', isSheet = !isSale && target === 'sheet';
    const scanMode = isSale ? 'sale' : isSheet ? 'sheet' : 'unit';
    const guide = isSheet ? SHEET_SCAN_GUIDE : SCAN_GUIDE;
    const liveCameraSupported = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

    function stop() {
        generation.current++; startup.current?.abort(); startup.current = null; tracker.current.reset();
        liveReader.current?.dispose(); liveReader.current = null;
        if (scanTimer.current !== null) clearTimeout(scanTimer.current); scanTimer.current = null;
        if (zoomTimer.current !== null) clearTimeout(zoomTimer.current); zoomTimer.current = null; zoomRevision.current++;
        stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
        if (video.current) { video.current.pause(); video.current.srcObject = null; }
        if (cropCanvas.current) cropCanvas.current.width = cropCanvas.current.width;
        if (alive.current) { setPhase('stopped'); setFrameReady(false); setTorch(false); setCapabilities({}); }
    }
    async function close() {
        stop();
        if (!isSale && collected.current.length && !await confirmAction({ title: 'Discard scanned IMEIs?', message: 'These scans have not been added to the product.', confirmLabel: 'Discard scans', tone: 'danger' })) return;
        onClose();
    }
    closeRef.current = () => { void close(); };
    useLayoutEffect(() => panel.current ? activateDialog(panel.current, () => closeRef.current()) : undefined, []);
    useEffect(() => {
        alive.current = true;
        const visibility = () => { if (document.hidden) stop(); };
        document.addEventListener('visibilitychange', visibility);
        if (liveCameraSupported) startRef.current();
        return () => { alive.current = false; stop(); document.removeEventListener('visibilitychange', visibility); };
    }, []);
    useEffect(() => {
        if (previousTarget.current === target) return;
        previousTarget.current = target; reader.current = null;
        if (mode === 'live' && liveCameraSupported) startRef.current();
    }, [target]);
    function decoder() {
        if (!reader.current) reader.current = Promise.all([import('@zxing/browser'), import('@zxing/library')]).then(([browser, library]) => {
            const hints = new Map();
            hints.set(library.DecodeHintType.POSSIBLE_FORMATS, isSheet ? [library.BarcodeFormat.PDF_417, library.BarcodeFormat.DATA_MATRIX, library.BarcodeFormat.QR_CODE, library.BarcodeFormat.AZTEC, library.BarcodeFormat.CODE_128] : [library.BarcodeFormat.CODE_128, library.BarcodeFormat.CODE_39, library.BarcodeFormat.ITF]);
            hints.set(library.DecodeHintType.TRY_HARDER, true);
            return new browser.BrowserMultiFormatReader(hints);
        }).catch(error => { reader.current = null; throw error; });
        return reader.current;
    }
    function accept(raw: string) {
        if (last.current.value === raw && Date.now() - last.current.time < 2000) return;
        last.current = { value: raw, time: Date.now() };
        try {
            if (isSale) {
                if (!onSaleScan) throw new Error('Scan-to-sell is unavailable. Reopen the scanner.');
                const code = normalizeScannedSaleCode(raw), label = onSaleScan(code);
                collected.current = [...collected.current, code]; setValues(collected.current);
                setSaleLabels(previous => [...previous, label]); setLastScanned(code);
                setMessage(`Added to order: ${label}`); setError('');
                try { navigator.vibrate?.(50); } catch { /* Optional feedback. */ }
                return;
            }
            if (isSheet) {
                const batch = parseSupplierImeis(raw), known = new Set([...existing.map(value => value.trim()), ...collected.current]);
                const fresh = batch.imeis.filter(value => !known.has(value));
                if (!fresh.length) { setMessage('All IMEIs in this supplier code are already entered.'); setError(''); return; }
                collected.current = [...collected.current, ...fresh]; setValues(collected.current);
                setBatchReview(true); setReviewed(false); setLastScanned(`${fresh.length} phones from supplier code`);
                setMessage(`${fresh.length} primary IMEIs decoded. ${batch.imeis.length - fresh.length} already entered; ${batch.excludedSecondary} labelled IMEI2 entries excluded. Review every phone before adding.`);
                setError(''); stop(); return;
            }
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
        tracker.current = createLiveImeiTracker(raw => isSale ? normalizeScannedSaleCode(raw) : isSheet ? (parseSupplierImeis(raw), raw.trim()) : scannedImei(raw), isSheet ? 10000 : 1200);
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
            // Let the browser display native video directly; do not copy the entire preview at 30 fps.
            setFrameReady(true);
            const scanCanvas = cropCanvas.current!;
            let background: BarcodeWorkerClient;
            try { background = new BarcodeWorkerClient(new Worker(new URL('../workers/imeiDecoder.worker.ts', import.meta.url), { type: 'module' }), isSheet ? 6000 : 2500); }
            catch { throw Object.assign(new Error('The background barcode reader is unavailable. Try another browser or use Photo.'), { name: 'BarcodeWorkerError' }); }
            liveReader.current = background;
            try { await background.ready; }
            catch (error) { throw Object.assign(error as Error, { name: 'BarcodeWorkerError' }); }
            if (!alive.current || run !== generation.current) return;
            setPhase('running'); setMessage(isSale ? 'Scan one available phone IMEI to add that phone to the order.' : isSheet ? 'Fit the complete supplier Total code inside the frame. Keep all four edges visible.' : 'Live picture ready. Keep one IMEI1 barcode centered between the corners.');
            let useBitmaps = background.supportsBitmaps && typeof createImageBitmap === 'function', lastFrameTime = -1;
            const drawCrop = (source: CanvasImageSource, width: number, height: number, crop?: ReturnType<typeof scanRegion>) => {
                if (scanCanvas.width !== width || scanCanvas.height !== height) { scanCanvas.width = width; scanCanvas.height = height; }
                const context = scanCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
                if (!context) throw new Error('Barcode capture is unavailable. Restart the scanner.');
                if (crop) context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
                else context.drawImage(source, 0, 0, width, height);
                return context;
            };
            const readFrame = async () => {
                if (!alive.current || run !== generation.current) return;
                const started = performance.now();
                let confirming = false;
                try {
                    // Skip repeated video frames, rather than confirming the same frozen camera frame twice.
                    if (preview.readyState >= 2 && preview.videoWidth && preview.videoHeight && preview.currentTime !== lastFrameTime && !background.busy) {
                        lastFrameTime = preview.currentTime;
                        const crop = scanRegion(preview.videoWidth, preview.videoHeight, guide), scale = Math.min(1, (isSheet ? 1280 : 960) / crop.width);
                        const width = Math.max(1, Math.round(crop.width * scale)), height = Math.max(1, Math.round(crop.height * scale));
                        let bitmap: ImageBitmap | null = null, raw: string | null = null;
                        try {
                            if (useBitmaps) {
                                try { bitmap = await createImageBitmap(preview, crop.x, crop.y, crop.width, crop.height, { resizeWidth: width, resizeHeight: height, resizeQuality: 'low' }); }
                                catch { useBitmaps = false; }
                            }
                            if (!alive.current || run !== generation.current) return;
                            if (bitmap) {
                                if (cropInspector.current?.open) drawCrop(bitmap, width, height);
                                const reading = background.decodeBitmap(bitmap, scanMode); bitmap = null;
                                raw = await reading;
                            } else {
                                // Older browsers keep a bounded crop fallback, with decoding still off the UI thread.
                                const context = drawCrop(preview, width, height, crop);
                                raw = await background.decode(context.getImageData(0, 0, width, height), scanMode);
                            }
                        } finally { bitmap?.close(); }
                        if (!alive.current || run !== generation.current) return;
                        if (raw) {
                            try {
                                const confirmed = tracker.current.observe(raw);
                                confirming = !confirmed && !collected.current.includes(raw) && !existing.includes(raw);
                                if (confirmed) accept(confirmed);
                            } catch { accept(raw); }
                        }
                    }
                } catch (error) {
                    if (alive.current && run === generation.current) { stop(); setError((error as Error).message || 'Barcode reading stopped. Restart the scanner.'); }
                    return;
                }
                // Adapt to actual processing cost. One frame in flight, with rendering time between samples.
                if (alive.current && run === generation.current) scanTimer.current = setTimeout(() => { void readFrame(); }, nextScanDelay(performance.now() - started, confirming));
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
        catch { if (alive.current && run === generation.current) setError(isSheet ? 'No readable Total code found. Take a sharp, straight close-up including the complete 2D code and its white margins.' : 'No readable barcode found. Retake a sharp close-up of one barcode including white margins at both ends.'); }
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
    return createPortal(<div className="imei-scanner-layer"><div ref={panel} className="dialog-surface imei-scanner-panel" role="dialog" aria-modal="true" aria-labelledby="imei-scanner-title">
        <header><div><h2 id="imei-scanner-title">{isSale ? 'Scan to sell' : 'Scan phone IMEIs'}</h2><p>{isSale ? 'Add products or specific phones to the current order' : isSheet ? 'Supplier Total code / bulk IMEI intake' : 'Position one IMEI1 barcode in the center'}</p></div><button type="button" onClick={() => void close()} aria-label="Close IMEI scanner"><X size={22} /></button></header>
        <div className="imei-scanner-body">
            {!isSale && <div className="imei-scan-modes" aria-label="Code type"><button type="button" aria-pressed={target === 'unit'} onClick={() => { if (target !== 'unit') { stop(); setTarget('unit'); } }}>One phone / IMEI1</button><button type="button" aria-pressed={target === 'sheet'} onClick={() => { if (target !== 'sheet') { stop(); setTarget('sheet'); } }}>Supplier Total code</button></div>}
            {isSheet && <p className="imei-sheet-help">Scan the large 2D Total code at the top of the sheet. Its encoded IMEI list will appear below. A reference number alone cannot reveal phone IMEIs.</p>}
            <div className="imei-scan-modes" aria-label="Barcode scanning method"><button type="button" aria-pressed={mode === 'live'} onClick={() => { setMode('live'); if (phase !== 'running' && phase !== 'starting') void start(); }}><Camera size={17} /> Live scanner</button><button type="button" aria-pressed={mode === 'photo'} onClick={() => { stop(); setMode('photo'); }}><ImagePlus size={17} /> Photo</button></div>
            <div className="imei-camera-preview" data-scanning={phase === 'running'} data-picture={frameReady} data-code-type={scanMode}>
                <video ref={video} muted playsInline autoPlay disablePictureInPicture aria-label="Live rear camera view" />
                <div className="imei-camera-shade" aria-hidden="true" />
                <div className="imei-camera-guide" style={{ left: `${guide.left * 100}%`, top: `${guide.top * 100}%`, width: `${guide.width * 100}%`, height: `${guide.height * 100}%` }} aria-hidden="true"><i /><i /><i /><i /></div>
                <span className="imei-live-badge">{phase === 'running' && frameReady ? 'LIVE CAMERA' : phase === 'starting' ? 'CONNECTING' : 'PAUSED'}<strong>{values.length} scanned</strong></span>
                {!frameReady && <div className="imei-preview-placeholder"><Camera size={30} /><span>{phase === 'starting' ? 'Waiting for camera picture...' : 'Start the camera to position your barcode'}</span></div>}
                <span className="imei-camera-caption">{frameReady ? 'Keep the complete barcode inside the corners' : 'Your camera picture will appear here'}</span>
            </div>
            <details ref={cropInspector} className="imei-crop-inspector" data-ready={frameReady}><summary>View barcode crop <span>{isSale ? 'Phone IMEI' : isSheet ? 'Total code' : 'IMEI1 only'}</span></summary><canvas ref={cropCanvas} aria-label="Exact center crop used for barcode decoding" /></details>
            {!liveCameraSupported && <p className="imei-camera-notice">Live scanning needs the HTTPS website and camera permission. Open the secure shop address on your phone.</p>}
            {mode === 'live' ? <div className="imei-camera-actions"><button type="button" disabled={!liveCameraSupported || phase === 'photo'} onClick={() => phase === 'running' || phase === 'starting' ? stop() : void start()}>{phase === 'running' || phase === 'starting' ? <><Pause size={17} /> Pause</> : <><Camera size={17} /> Start camera</>}</button><button type="button" disabled={!liveCameraSupported || phase === 'photo'} onClick={() => void start()}><RotateCcw size={17} /> Restart camera</button>{phase === 'running' && capabilities.torch && <button type="button" aria-pressed={torch} onClick={() => void cameraSetting({ torch: !torch })}><Flashlight size={17} /> Light {torch ? 'off' : 'on'}</button>}</div> : <div className="imei-camera-actions">
                <label className={phase === 'photo' ? 'disabled' : ''}><Camera size={17} /> Take barcode photo<input aria-label="Take barcode photo with phone camera" type="file" accept="image/*" capture="environment" disabled={phase === 'photo'} onChange={event => { void photo(event.target.files?.[0]); event.target.value = ''; }} /></label>
                <label className={phase === 'photo' ? 'disabled' : ''}><ImagePlus size={17} /> Choose photo<input aria-label="Choose existing barcode photo" type="file" accept="image/*" disabled={phase === 'photo'} onChange={event => { void photo(event.target.files?.[0]); event.target.value = ''; }} /></label>
            </div>}
            {mode === 'live' && devices.length > 1 && <label className="imei-camera-select">Camera<select value={device} disabled={phase === 'starting' || phase === 'photo'} onChange={event => { setDevice(event.target.value); void start(event.target.value); }}><option value="">Automatic rear camera</option>{devices.map((item, index) => <option key={item.deviceId} value={item.deviceId}>{item.label || `Camera ${index + 1}`}</option>)}</select></label>}
            {phase === 'running' && zoomRange && <div className="imei-zoom-control"><label>Zoom <output>{zoom.toFixed(1)}x</output><input aria-label="Camera zoom" type="range" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step || .1} value={zoom} onChange={event => queueZoom(Number(event.target.value))} /></label><button type="button" onClick={() => queueZoom(Math.min(zoomRange.max, Math.max(zoomRange.min, 1)))}>Reset</button></div>}
            {lastScanned && <div className="imei-last-scan"><Check size={18} /><span>Last added <strong>{lastScanned}</strong></span></div>}
            <p className="imei-scan-status" role="status">{message}</p>{error && <p className="imei-scan-error" role="alert">{error}</p>}
            {isSale && <button type="button" className="imei-rescan-button" onClick={() => { tracker.current.reset(); last.current = { value: '', time: 0 }; setError(''); setMessage('Ready for the next phone. Each IMEI can only be added once.'); }}>Reset scanner</button>}
            <div className="imei-scan-list"><h3>{values.length} {isSale ? 'scans added to order' : 'IMEIs for review'}</h3><p>{isSale ? 'Review quantities and prices in the cart. Scanning does not complete a sale.' : 'Use one primary IMEI per phone. IMEI2 belongs to the same phone. Check the list against your supplier sheet.'}</p>{values.map((value, index) => <div key={`${value}-${index}`}><span>{isSale ? saleLabels[index] : value}</span>{!isSale && <button type="button" aria-label={`Remove IMEI ${value}`} onClick={() => { collected.current = collected.current.filter(item => item !== value); setValues(collected.current); tracker.current.reset(); last.current = { value: '', time: 0 }; if (lastScanned === value) setLastScanned(''); }}><Trash2 size={17} /></button>}</div>)}</div>
            {!isSale && batchReview && <label className="imei-batch-review"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /><span>I checked that these are primary IMEI1 numbers, one per physical phone, for this product.</span></label>}
        </div>
        <footer><p>{isSale ? 'Items are in the draft cart. Select a customer and review payment before completing the sale.' : 'Scans are saved to inventory when you save the product.'}</p>{isSale ? <button type="button" onClick={() => { stop(); onClose(); }}><Check size={18} /> Review current order</button> : <button type="button" disabled={!values.length || (batchReview && !reviewed)} onClick={() => { stop(); try { onApply?.(collected.current); } catch (error) { setError((error as Error).message); } }}><Check size={18} /> Add {values.length} IMEIs to product</button>}</footer>
    </div></div>, document.body);
}
