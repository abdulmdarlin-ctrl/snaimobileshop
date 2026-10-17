import { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, MultiFormatOneDReader, DecodeHintType, BarcodeFormat } from '@zxing/library';
import type { BarcodeDecodeRequest, BarcodeDecodeResponse } from '../utils/barcodeWorkerClient';

const scope = self as unknown as { onmessage: ((event: MessageEvent<BarcodeDecodeRequest>) => void) | null; postMessage: (message: BarcodeDecodeResponse) => void };
const formats = [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF];
const fastHints = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, formats]]);
const thoroughHints = new Map<DecodeHintType, unknown>([...fastHints, [DecodeHintType.TRY_HARDER, true]]);
const fastReader = new MultiFormatOneDReader(fastHints), thoroughReader = new MultiFormatOneDReader(thoroughHints);
let misses = 0;
scope.onmessage = ({ data }) => {
    if (data.type !== 'decode') return;
    let text: string | null = null;
    try {
        const rgba = new Uint8ClampedArray(data.pixels), count = data.width * data.height;
        if (!Number.isSafeInteger(count) || count < 1 || count > 1000000 || rgba.length !== count * 4) throw new Error('Invalid crop');
        // Convert RGBA here, off the UI thread. ZXing expects one luminance byte per pixel.
        const gray = new Uint8ClampedArray(count);
        for (let pixel = 0, offset = 0; pixel < count; pixel++, offset += 4) gray[pixel] = (rgba[offset] + 2 * rgba[offset + 1] + rgba[offset + 2]) / 4;
        const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, data.width, data.height)));
        try { text = fastReader.decode(bitmap, fastHints).getText(); }
        catch { if (++misses % 4 === 0) text = thoroughReader.decode(bitmap, thoroughHints).getText(); }
        if (text) misses = 0;
    } catch { /* Empty, blurred and incomplete frames are normal during positioning. */ }
    finally { fastReader.reset(); thoroughReader.reset(); }
    scope.postMessage({ type: 'result', id: data.id, text });
};
scope.postMessage({ type: 'ready' });
