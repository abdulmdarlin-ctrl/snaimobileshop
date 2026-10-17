import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X, Trash2, Flashlight, ImagePlus, Check, Pause } from 'lucide-react';
import type { BrowserMultiFormatReader } from '@zxing/browser';
import { scannedImei, scanRegion, createLiveImeiTracker } from '../utils/imeiScanner';
import { confirmAction } from '../utils/dialog';
import { requestBarcodeCamera, barcodeCameraCapabilities, enableBarcodeAutofocus, cameraErrorMessage, type BarcodeCameraCapabilities } from '../utils/camera';

interface Props { existing: string[]; onApply: (values: string[]) => void; onClose: () => void; }
export default function ImeiScanner({ existing, onApply, onClose }: Props) {
    const video = useRef<HTMLVideoElement>(null), panel = useRef<HTMLDivElement>(null);
    const stream = useRef<MediaStream | null>(null), timer = useRef<ReturnType<typeof setInterval> | null>(null);
    const generation = useRef(0), alive = useRef(true), reader = useRef<Promise<BrowserMultiFormatReader> | null>(null);
    const collected = useRef<string[]>([]), last = useRef({ value: '', time: 0 });
    const [values, setValues] = useState<string[]>([]), [message, setMessage] = useState('Scan one IMEI1 barcode at a time.');
    const [error, setError] = useState(''), [phase, setPhase] = useState<'stopped' | 'starting' | 'running' | 'photo'>('stopped');
    const [mode, setMode] = useState<'live' | 'photo'>('live');
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [device, setDevice] = useState('');
    const [lastScanned, setLastScanned] = useState('');
    const tracker = useRef(createLiveImeiTracker());
    const startRef = useRef<() => void>(() => {});
    const [torch, setTorch] = useState(false), [capabilities, setCapabilities] = useState<BarcodeCameraCapabilities>({}), [zoom, setZoom] = useState(1);
    const liveCameraSupported = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
    const closeRef = useRef<() => void>(() => {});
    function stop() {
        generation.current++;
        tracker.current.reset();
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
        if (video.current) video.current.srcObject = null;
        if (alive.current) { setPhase('stopped'); setTorch(false); setCapabilities({}); }
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
            const buttons = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') || []).filter(el => el.getClientRects().length);
            const first = buttons[0], end = buttons[buttons.length - 1];
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
            const hints = new Map(); hints.set(library.DecodeHintType.POSSIBLE_FORMATS, [library.BarcodeFormat.CODE_128, library.BarcodeFormat.CODE_39, library.BarcodeFormat.ITF, library.BarcodeFormat.EAN_13]);
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
            collected.current = [...collected.current, value]; setValues(collected.current);
            setLastScanned(value);
            setMessage(`Added ${value}. Move to the next IMEI1 barcode.`); setError('');
            try { navigator.vibrate?.(70); } catch { /* Haptic feedback is optional. */ }
        } catch (error) { setError((error as Error).message); }
    }
    async function start(requestedDevice = device) {
        stop(); setError('');
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setError('Live video scanning needs HTTPS. Use Take barcode photo below to open your phone camera on this address.'); return; }
        const run = generation.current; setPhase('starting');
        try {
            // Ask permission from the button action before waiting for decoder downloads.
            const media = await requestBarcodeCamera(navigator.mediaDevices, requestedDevice);
            if (!alive.current || run !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
            stream.current = media;
            const preview = video.current!;
            preview.muted = true; preview.playsInline = true; preview.srcObject = media;
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Camera preview timed out.')), 10000);
                preview.play().then(() => { clearTimeout(timeout); resolve(); }, error => { clearTimeout(timeout); reject(error); });
            });
            if (!alive.current || run !== generation.current) return;
            const codeReader = await decoder();
            if (!alive.current || run !== generation.current) return;
            const track = media.getVideoTracks()[0];
            const caps = barcodeCameraCapabilities(track); setCapabilities(caps); setZoom(caps.zoom?.min || 1);
            void enableBarcodeAutofocus(track, caps);
            track.addEventListener('ended', () => { if (alive.current && run === generation.current) { stop(); setError('The camera stopped. Tap Start camera to reconnect.'); } }, { once: true });
            navigator.mediaDevices.enumerateDevices?.().then(list => { if (alive.current && run === generation.current) setDevices(list.filter(item => item.kind === 'videoinput')); }).catch(() => {});
            const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('Camera canvas unavailable.');
            setPhase('running');
            setMessage('Live scanning. Hold one IMEI1 barcode steady inside the guide.');
            timer.current = setInterval(() => {
                const source = video.current; if (!source?.videoWidth || source.readyState < 2) return;
                const crop = scanRegion(source.videoWidth, source.videoHeight);
                canvas.width = Math.round(crop.width); canvas.height = Math.round(crop.height);
                let raw: string;
                try {
                    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
                    raw = codeReader.decodeFromCanvas(canvas).getText();
                } catch { return; }
                try {
                    const confirmed = tracker.current.observe(raw);
                    if (confirmed) accept(confirmed);
                } catch { accept(raw); }
            }, 200);
        } catch (error) {
            if (!alive.current || run !== generation.current) return;
            stop();
            setError(cameraErrorMessage(error));
        }
    }
    startRef.current = () => { void start(); };
    async function photo(file?: File) {
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) { setError('Choose a close-up photo smaller than 20 MB.'); return; }
        stop(); const run = generation.current; setPhase('photo'); setError('');
        const url = URL.createObjectURL(file);
        try {
            const codeReader = await decoder(); const result = await codeReader.decodeFromImageUrl(url);
            if (alive.current && run === generation.current) accept(result.getText());
        } catch { if (alive.current && run === generation.current) setError('No readable barcode found. Retake a sharp close-up of one IMEI1 barcode, with the bars horizontal. Keep the complete barcode and a white margin at both ends.'); }
        finally { URL.revokeObjectURL(url); if (alive.current && run === generation.current) setPhase('stopped'); }
    }
    async function cameraSetting(setting: { torch?: boolean; zoom?: number }) {
        try { await stream.current?.getVideoTracks()[0]?.applyConstraints({ advanced: [setting as MediaTrackConstraintSet] }); if (setting.torch !== undefined) setTorch(setting.torch); if (setting.zoom !== undefined) setZoom(setting.zoom); }
        catch { setError('This camera could not apply that setting. Continue scanning without it.'); }
    }
    return createPortal(<div className="imei-scanner-layer"><div ref={panel} className="imei-scanner-panel" role="dialog" aria-modal="true" aria-labelledby="imei-scanner-title">
        <header><div><h2 id="imei-scanner-title">Scan phone IMEIs</h2><p>Supplier intake / IMEI1 only</p></div><button type="button" onClick={() => void close()} aria-label="Close IMEI scanner"><X size={22} /></button></header>
        <div className="imei-scanner-body">
            <div className="imei-scanner-guidance">Scan one primary IMEI (IMEI1) per physical phone. IMEI2 belongs to the same phone.</div>
            <div className="imei-scan-modes" aria-label="Barcode scanning method"><button type="button" aria-pressed={mode === 'live'} onClick={() => { setMode('live'); if (phase !== 'running' && phase !== 'starting') void start(); }}><Camera size={17} /> Live scanner</button><button type="button" aria-pressed={mode === 'photo'} onClick={() => { stop(); setMode('photo'); }}><ImagePlus size={17} /> Photo</button></div>
            <div className="imei-camera-preview" data-scanning={phase === 'running'}><video ref={video} muted playsInline autoPlay /><div className="imei-camera-guide" aria-hidden="true" /><span className="imei-live-badge">{phase === 'running' ? 'LIVE' : phase === 'starting' ? 'CONNECTING' : 'PAUSED'}<strong>{values.length} scanned</strong></span><span className="imei-camera-caption">{phase === 'starting' ? 'Opening camera...' : phase === 'photo' ? 'Reading photo...' : phase === 'running' ? 'Align one IMEI1 barcode inside the guide' : 'Tap Start live scanning to continue'}</span></div>
            {!liveCameraSupported && <p className="imei-camera-notice">Live scanning needs the HTTPS website and camera permission. This browser address cannot provide live video. Open the secure shop address on your phone.</p>}
            {mode === 'live' ? <div className="imei-camera-actions"><button type="button" disabled={!liveCameraSupported || phase === 'photo'} onClick={() => phase === 'running' || phase === 'starting' ? stop() : void start()}>{phase === 'running' || phase === 'starting' ? <><Pause size={17} /> Pause live scanning</> : <><Camera size={17} /> Start live scanning</>}</button>
                {phase === 'running' && capabilities.torch && <button type="button" aria-pressed={torch} onClick={() => void cameraSetting({ torch: !torch })}><Flashlight size={17} /> Light {torch ? 'off' : 'on'}</button>}
            </div> : <div className="imei-camera-actions">
                <label className={phase === 'photo' ? 'disabled' : ''}><Camera size={17} /> Take barcode photo<input aria-label="Take barcode photo with phone camera" type="file" accept="image/*" capture="environment" disabled={phase === 'photo'} onChange={event => { void photo(event.target.files?.[0]); event.target.value = ''; }} /></label>
                <label className={phase === 'photo' ? 'disabled' : ''}><ImagePlus size={17} /> Choose photo<input aria-label="Choose existing barcode photo" type="file" accept="image/*" disabled={phase === 'photo'} onChange={event => { void photo(event.target.files?.[0]); event.target.value = ''; }} /></label>
            </div>}
            {lastScanned && <div className="imei-last-scan"><Check size={18} /><span>Last added <strong>{lastScanned}</strong></span></div>}
            {mode === 'live' && devices.length > 1 && <label className="imei-camera-select">Camera<select value={device} disabled={phase === 'starting' || phase === 'photo'} onChange={event => { setDevice(event.target.value); void start(event.target.value); }}><option value="">Automatic rear camera</option>{devices.map((item, index) => <option key={item.deviceId} value={item.deviceId}>{item.label || `Camera ${index + 1}`}</option>)}</select></label>}
            {phase === 'running' && capabilities.zoom && <label className="imei-camera-select">Zoom<input type="range" min={capabilities.zoom.min} max={capabilities.zoom.max} step={capabilities.zoom.step || .1} value={zoom} onChange={event => void cameraSetting({ zoom: Number(event.target.value) })} /></label>}
            <p className="imei-scan-status" role="status">{message}</p>{error && <p className="imei-scan-error" role="alert">{error}</p>}
            <div className="imei-scan-list"><h3>{values.length} scanned for review</h3><p>Check each number against the sheet. Scan close-up, one row at a time; the sheet total is not an IMEI.</p>{values.map(value => <div key={value}><span>{value}</span><button type="button" aria-label={`Remove IMEI ${value}`} onClick={() => { collected.current = collected.current.filter(item => item !== value); setValues(collected.current); }}><Trash2 size={17} /></button></div>)}</div>
        </div>
        <footer><p>Scans are saved to inventory only when you save the product.</p><button type="button" disabled={!values.length} onClick={() => { stop(); try { onApply(collected.current); } catch (error) { setError((error as Error).message); } }}><Check size={18} /> Add {values.length} IMEIs to product</button></footer>
    </div></div>, document.body);
}
