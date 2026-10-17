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
