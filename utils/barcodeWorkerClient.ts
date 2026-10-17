export type BarcodeDecodeRequest = { type: 'decode'; id: number; width: number; height: number; pixels: ArrayBuffer } | { type: 'bitmap'; id: number; bitmap: ImageBitmap };
export type BarcodeDecodeResponse = { type: 'ready'; bitmaps?: boolean } | { type: 'result'; id: number; text: string | null };
type Channel = Pick<Worker, 'onmessage' | 'onerror' | 'onmessageerror' | 'postMessage' | 'terminate'>;

// One transferred crop at a time: never queue old camera frames behind a slow decode.
export class BarcodeWorkerClient {
    readonly ready: Promise<void>;
    private pending: { id: number; resolve: (text: string | null) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> } | null = null;
    private readyTimer: ReturnType<typeof setTimeout>;
    private resolveReady!: () => void;
    private rejectReady!: (error: Error) => void;
    private initialized = false;
    supportsBitmaps = false;
    private closed = false;
    private sequence = 0;

    constructor(private worker: Channel, private decodeTimeout = 2500, startupTimeout = 15000) {
        this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
        // Disposal can happen before the caller starts awaiting worker initialization.
        void this.ready.catch(() => {});
        this.readyTimer = setTimeout(() => this.fail(new Error('The barcode reader took too long to load. Restart the scanner.')), startupTimeout);
        worker.onmessage = (event: MessageEvent<BarcodeDecodeResponse>) => {
            if (this.closed) return;
            if (event.data.type === 'ready') { clearTimeout(this.readyTimer); this.initialized = true; this.supportsBitmaps = event.data.bitmaps === true; this.resolveReady(); return; }
            const pending = this.pending;
            if (event.data.type !== 'result' || !pending || event.data.id !== pending.id) return;
            clearTimeout(pending.timeout); this.pending = null; pending.resolve(event.data.text);
        };
        worker.onerror = event => { event.preventDefault(); this.fail(new Error('The background barcode reader stopped. Restart the scanner or use Photo.')); };
        worker.onmessageerror = () => this.fail(new Error('The barcode image could not be read. Restart the scanner.'));
    }
    get busy() { return this.pending !== null; }
    decode(frame: ImageData): Promise<string | null> {
        const pixels = frame.data.buffer as ArrayBuffer;
        return this.submit(id => ({ type: 'decode', id, width: frame.width, height: frame.height, pixels }), [pixels]);
    }
    decodeBitmap(bitmap: ImageBitmap): Promise<string | null> {
        return this.submit(id => ({ type: 'bitmap', id, bitmap }), [bitmap], () => bitmap.close());
    }
    private submit(request: (id: number) => BarcodeDecodeRequest, transfer: Transferable[], release = () => {}) {
        if (this.closed || !this.initialized) { release(); return Promise.reject(new Error('The barcode reader is not ready. Restart the scanner.')); }
        if (this.pending) { release(); return Promise.resolve(null); }
        return new Promise<string | null>((resolve, reject) => {
            const id = ++this.sequence;
            const timeout = setTimeout(() => this.fail(new Error('Barcode reading stalled. Restart the scanner or use Photo.')), this.decodeTimeout);
            this.pending = { id, resolve, reject, timeout };
            try { this.worker.postMessage(request(id), transfer); }
            catch { release(); this.fail(new Error('The barcode image could not be sent to the background reader. Restart the scanner.')); }
        });
    }
    private fail(error: Error) {
        if (this.closed) return;
        this.rejectReady(error);
        const pending = this.pending;
        if (pending) { clearTimeout(pending.timeout); this.pending = null; }
        this.dispose(); pending?.reject(error);
    }
    dispose() {
        if (this.closed) return;
        this.closed = true; clearTimeout(this.readyTimer);
        this.rejectReady(Object.assign(new Error('Scanner closed.'), { name: 'AbortError' }));
        if (this.pending) { clearTimeout(this.pending.timeout); this.pending.resolve(null); this.pending = null; }
        this.worker.onmessage = null; this.worker.onerror = null; this.worker.onmessageerror = null; this.worker.terminate();
    }
}
