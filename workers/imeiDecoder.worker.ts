import { BitArray, BinaryBitmap, HybridBinarizer, RGBLuminanceSource, MultiFormatOneDReader, DecodeHintType, BarcodeFormat } from '@zxing/library';
import type { BarcodeDecodeRequest, BarcodeDecodeResponse } from '../utils/barcodeWorkerClient';

type DetectedBarcode = { rawValue: string; boundingBox: { y: number; height: number } };
type NativeDetector = { detect: (image: ImageBitmap) => Promise<DetectedBarcode[]> };
type NativeDetectorConstructor = { new(options: { formats: string[] }): NativeDetector; getSupportedFormats: () => Promise<string[]> };
const scope = self as unknown as { onmessage: ((event: MessageEvent<BarcodeDecodeRequest>) => void) | null; postMessage: (message: BarcodeDecodeResponse) => void; BarcodeDetector?: NativeDetectorConstructor };
const formats = [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF];
const fastHints = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, formats]]);
const thoroughHints = new Map<DecodeHintType, unknown>([...fastHints, [DecodeHintType.TRY_HARDER, true]]);
const fastReader = new MultiFormatOneDReader(fastHints), thoroughReader = new MultiFormatOneDReader(thoroughHints);
let misses = 0, nativeMisses = 0, confirmThoroughRead = false;
let surface: OffscreenCanvas | null = null, context: OffscreenCanvasRenderingContext2D | null = null;
let native: NativeDetector | null = null;
function decodePixels(rgba: Uint8ClampedArray, width: number, height: number) {
    const count = width * height;
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000000 || rgba.length !== count * 4) return null;
    const gray = new Uint8ClampedArray(count);
    for (let pixel = 0, offset = 0; pixel < count; pixel++, offset += 4) gray[pixel] = (rgba[offset] + 2 * rgba[offset + 1] + rgba[offset + 2]) / 4;
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, width, height)));
    let text: string | null = null;
    // Most level barcodes need only a few rows. Avoid sweeping the entire crop on every frame.
    let row = new BitArray(width);
    for (const fraction of [.5, .4, .6]) {
        const rowNumber = Math.min(height - 1, Math.floor(height * fraction));
        try {
            row = bitmap.getBlackRow(rowNumber, row);
            try { text = fastReader.decodeRow(rowNumber, row, fastHints).getText(); }
            catch { row.reverse(); text = fastReader.decodeRow(rowNumber, row, fastHints).getText(); }
            if (text) break;
        } catch { /* Try another center row. */ }
    }
    const followUp = confirmThoroughRead; confirmThoroughRead = false;
    if (!text && (followUp || ++misses % 6 === 0)) {
        try { text = thoroughReader.decode(bitmap, thoroughHints).getText(); confirmThoroughRead = !!text && !followUp; } catch { /* Repositioning is normal. */ }
    }
    if (text) misses = 0;
    return text;
}
scope.onmessage = async ({ data }) => {
    let text: string | null = null;
    try {
        if (data.type === 'bitmap') {
            if (!context || !surface) throw new Error('Bitmap capture unavailable');
            if (native) {
                try {
                    const codes = await native.detect(data.bitmap);
                    const closest = codes.filter(code => /^\d{15}$/.test(code.rawValue)).sort((a, b) => Math.abs(a.boundingBox.y + a.boundingBox.height / 2 - data.bitmap.height / 2) - Math.abs(b.boundingBox.y + b.boundingBox.height / 2 - data.bitmap.height / 2))[0];
                    if (closest) { text = closest.rawValue; nativeMisses = 0; }
                } catch { native = null; }
            }
            if (!text && (!native || ++nativeMisses % 4 === 0)) {
                if (surface.width !== data.bitmap.width || surface.height !== data.bitmap.height) { surface.width = data.bitmap.width; surface.height = data.bitmap.height; }
                context.drawImage(data.bitmap, 0, 0);
                text = decodePixels(context.getImageData(0, 0, surface.width, surface.height).data, surface.width, surface.height);
            }
        } else {
            text = decodePixels(new Uint8ClampedArray(data.pixels), data.width, data.height);
        }
    } catch { /* Empty, blurred and incomplete frames are normal during positioning. */ }
    finally { if (data.type === 'bitmap') data.bitmap.close(); fastReader.reset(); thoroughReader.reset(); }
    scope.postMessage({ type: 'result', id: data.id, text });
};
async function initialize() {
    try { surface = new OffscreenCanvas(1, 1); context = surface.getContext('2d', { willReadFrequently: true }); }
    catch { surface = null; context = null; }
    // Native detection is optional; ZXing remains available on every supported browser.
    if (context && scope.BarcodeDetector) {
        try {
            const supported = await scope.BarcodeDetector.getSupportedFormats();
            const formats = ['code_128', 'code_39', 'itf'].filter(format => supported.includes(format));
            if (formats.length) native = new scope.BarcodeDetector({ formats });
        } catch { native = null; }
    }
    scope.postMessage({ type: 'ready', bitmaps: !!context });
}
void initialize();
