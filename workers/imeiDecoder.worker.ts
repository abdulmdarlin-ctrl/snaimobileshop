import { MultiFormatReader, BitArray, BinaryBitmap, HybridBinarizer, RGBLuminanceSource, MultiFormatOneDReader, DecodeHintType, BarcodeFormat } from '@zxing/library';
import type { BarcodeScanMode, BarcodeDecodeRequest, BarcodeDecodeResponse } from '../utils/barcodeWorkerClient';

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
const native: Partial<Record<BarcodeScanMode, NativeDetector>> = {};
const saleHints = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, formats]]);
const saleReader = new MultiFormatOneDReader(saleHints);
let sheetReader: MultiFormatReader | null = null;
function decodePixels(rgba: Uint8ClampedArray, width: number, height: number, mode: BarcodeScanMode = 'unit') {
    const count = width * height;
    if (!Number.isSafeInteger(count) || count < 1 || count > 1000000 || rgba.length !== count * 4) return null;
    const gray = new Uint8ClampedArray(count);
    for (let pixel = 0, offset = 0; pixel < count; pixel++, offset += 4) gray[pixel] = (rgba[offset] + 2 * rgba[offset + 1] + rgba[offset + 2]) / 4;
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, width, height)));
    if (mode === 'sheet') {
        if (!sheetReader) { sheetReader = new MultiFormatReader(); sheetReader.setHints(new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.PDF_417, BarcodeFormat.DATA_MATRIX, BarcodeFormat.QR_CODE, BarcodeFormat.AZTEC, BarcodeFormat.CODE_128]], [DecodeHintType.TRY_HARDER, true]])); }
        try { return sheetReader.decodeWithState(bitmap).getText(); } catch { return null; } finally { sheetReader.reset(); }
    }
    const rowReader = mode === 'sale' ? saleReader : fastReader, rowHints = mode === 'sale' ? saleHints : fastHints;
    let text: string | null = null;
    // Most level barcodes need only a few rows. Avoid sweeping the entire crop on every frame.
    let row = new BitArray(width);
    for (const fraction of [.5, .4, .6]) {
        const rowNumber = Math.min(height - 1, Math.floor(height * fraction));
        try {
            row = bitmap.getBlackRow(rowNumber, row);
            try { text = rowReader.decodeRow(rowNumber, row, rowHints).getText(); }
            catch { row.reverse(); text = rowReader.decodeRow(rowNumber, row, rowHints).getText(); }
            if (text) break;
        } catch { /* Try another center row. */ }
    }
    const followUp = confirmThoroughRead; confirmThoroughRead = false;
    if (!text && (followUp || ++misses % 6 === 0)) {
        try { text = (mode === 'sale' ? saleReader.decode(bitmap, new Map([...saleHints, [DecodeHintType.TRY_HARDER, true]])) : thoroughReader.decode(bitmap, thoroughHints)).getText(); confirmThoroughRead = !!text && !followUp; } catch { /* Repositioning is normal. */ }
    }
    if (text) misses = 0;
    return text;
}
scope.onmessage = async ({ data }) => {
    let text: string | null = null;
    const mode = data.mode || 'unit';
    try {
        if (data.type === 'bitmap') {
            if (!context || !surface) throw new Error('Bitmap capture unavailable');
            if (native[mode]) {
                try {
                    const codes = await native[mode]!.detect(data.bitmap);
                    const closest = codes.filter(code => mode !== 'unit' || /^\d{15}$/.test(code.rawValue)).sort((a, b) => Math.abs(a.boundingBox.y + a.boundingBox.height / 2 - data.bitmap.height / 2) - Math.abs(b.boundingBox.y + b.boundingBox.height / 2 - data.bitmap.height / 2))[0];
                    if (closest) { text = closest.rawValue; nativeMisses = 0; }
                } catch { delete native[mode]; }
            }
            if (!text && (!native[mode] || ++nativeMisses % 3 === 0)) {
                if (surface.width !== data.bitmap.width || surface.height !== data.bitmap.height) { surface.width = data.bitmap.width; surface.height = data.bitmap.height; }
                context.drawImage(data.bitmap, 0, 0);
                text = decodePixels(context.getImageData(0, 0, surface.width, surface.height).data, surface.width, surface.height, mode);
            }
        } else {
            text = decodePixels(new Uint8ClampedArray(data.pixels), data.width, data.height, mode);
        }
    } catch { /* Empty, blurred and incomplete frames are normal during positioning. */ }
    finally { if (data.type === 'bitmap') data.bitmap.close(); fastReader.reset(); thoroughReader.reset(); saleReader.reset(); }
    scope.postMessage({ type: 'result', id: data.id, text });
};
async function initialize() {
    try { surface = new OffscreenCanvas(1, 1); context = surface.getContext('2d', { willReadFrequently: true }); }
    catch { surface = null; context = null; }
    // Native detection is optional; ZXing remains available on every supported browser.
    if (context && scope.BarcodeDetector) {
        try {
            const supported = await scope.BarcodeDetector.getSupportedFormats();
            const groups: Record<BarcodeScanMode, string[]> = {
                unit: ['code_128', 'code_39', 'itf'], sheet: ['pdf417', 'qr_code', 'data_matrix', 'aztec', 'code_128'],
                sale: ['code_128', 'code_39', 'itf'],
            };
            for (const mode of Object.keys(groups) as BarcodeScanMode[]) {
                const formats = groups[mode].filter(format => supported.includes(format));
                if (formats.length) native[mode] = new scope.BarcodeDetector({ formats });
            }
        } catch { /* Use the worker decoder when native detection is unavailable. */ }
    }
    scope.postMessage({ type: 'ready', bitmaps: !!context });
}
void initialize();
