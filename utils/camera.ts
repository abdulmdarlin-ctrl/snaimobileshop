export type BarcodeCameraCapabilities = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[]; zoom?: { min: number; max: number; step: number } };

export async function requestBarcodeCamera(media: Pick<MediaDevices, 'getUserMedia'>, deviceId = ''): Promise<MediaStream> {
    const cameras: MediaTrackConstraints[] = [
        { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1920 }, height: { ideal: 1440 } },
        { facingMode: { ideal: 'environment' } },
    ];
    for (let index = 0; index < cameras.length; index++) {
        try { return await media.getUserMedia({ audio: false, video: cameras[index] }); }
        catch (error) {
            const name = (error as Error).name;
            if (index === cameras.length - 1 || !['OverconstrainedError', 'ConstraintNotSatisfiedError', 'NotFoundError'].includes(name)) throw error;
        }
    }
    throw new Error('No camera available.');
}

export function barcodeCameraCapabilities(track: MediaStreamTrack): BarcodeCameraCapabilities {
    // Optional camera controls must never stop an otherwise working preview.
    try { return (track.getCapabilities?.() || {}) as BarcodeCameraCapabilities; }
    catch { return {}; }
}

export function cameraErrorMessage(error: unknown): string {
    const name = (error as Error)?.name;
    if (name === 'CameraFrameError') return 'The camera opened but no picture arrived. Select another rear camera below or tap Restart camera.';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'Camera access was blocked. Allow camera access in your browser settings, then try again. You can also use Take barcode photo below.';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No available camera was found. Try another camera or use Take barcode photo.';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'The camera is busy. Close other camera apps or browser tabs, then try again.';
    if (name === 'SecurityError') return 'Live scanning requires a secure HTTPS address and camera permission. Use Take barcode photo if live scanning is unavailable.';
    return 'Could not start the live camera. Try again, or use Take barcode photo to scan with your phone camera.';
}

export async function enableBarcodeAutofocus(track: MediaStreamTrack, capabilities: BarcodeCameraCapabilities): Promise<void> {
    if (!capabilities.focusMode?.includes('continuous')) return;
    try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }); }
    catch { /* Keep the camera running when optional focus controls are unavailable. */ }
}

export function cameraZoom(track: MediaStreamTrack, capabilities: BarcodeCameraCapabilities): number {
    const range = capabilities.zoom;
    const fallback = range ? Math.min(range.max, Math.max(range.min, 1)) : 1;
    try {
        const zoom = (track.getSettings?.() as MediaTrackSettings & { zoom?: number })?.zoom;
        return typeof zoom === 'number' && Number.isFinite(zoom) ? range ? Math.min(range.max, Math.max(range.min, zoom)) : zoom : fallback;
    } catch { return fallback; }
}

export async function resetCameraZoom(track: MediaStreamTrack, capabilities: BarcodeCameraCapabilities): Promise<number> {
    const range = capabilities.zoom;
    if (range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.max > range.min) {
        const zoom = Math.min(range.max, Math.max(range.min, 1));
        try { await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] }); }
        catch { /* Read back the actual zoom even when a reset is unavailable. */ }
    }
    return cameraZoom(track, capabilities);
}

export function waitForCameraFrame(video: Pick<HTMLVideoElement, 'readyState' | 'videoWidth' | 'videoHeight'>, timeoutMs = 10000, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        let poll: ReturnType<typeof setInterval>;
        const cleanup = () => { clearInterval(poll); clearTimeout(timeout); signal?.removeEventListener('abort', abort); };
        const abort = () => { cleanup(); reject(Object.assign(new Error('Camera startup cancelled.'), { name: 'AbortError' })); };
        const check = () => { if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) { cleanup(); resolve(); } };
        const timeout = setTimeout(() => { cleanup(); reject(Object.assign(new Error('No camera frames arrived. Choose another camera or restart the preview.'), { name: 'CameraFrameError' })); }, timeoutMs);
        poll = setInterval(check, 50);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort(); else check();
    });
}
