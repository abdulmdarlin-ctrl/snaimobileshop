// Barcode intake is stricter than legacy manual entry: require a valid IMEI checksum.
export function scannedImei(raw: string): string {
    const text = raw.trim();
    if (/^IMEI\s*2\s*[:=-]/i.test(text)) throw new Error('Scan IMEI1 only. IMEI2 is the second SIM identity of the same phone.');
    const value = text.replace(/^IMEI\s*1?\s*[:=-]\s*/i, '').trim();
    if (!/^\d{15}$/.test(value) || /^(\d)\1{14}$/.test(value)) throw new Error('This is not a phone IMEI. Scan one 15-digit IMEI1 barcode, not the sheet total.');
    const sum = [...value].reduce((total, digit, index) => {
        const n = Number(digit) * (index % 2 === 1 ? 2 : 1);
        return total + (n > 9 ? n - 9 : n);
    }, 0);
    if (sum % 10 !== 0) throw new Error('IMEI checksum failed. Move closer, hold steady and scan again.');
    return value;
}

export function mergeScannedImeis(existing: string[], quantity: number, scanned: string[]) {
    const next = Array.from({ length: Math.max(existing.length, Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0) }, (_, i) => existing[i]?.trim() || '');
    const known = new Set(next.filter(Boolean));
    for (const raw of scanned) {
        const value = scannedImei(raw);
        if (known.has(value)) throw new Error(`IMEI ${value} is already entered.`);
        known.add(value);
        const blank = next.indexOf('');
        if (blank >= 0) next[blank] = value;
        else next.push(value);
    }
    return { imeis: next, quantity: next.length };
}

// All preview and decoder coordinates share these guide proportions.
export const SCAN_GUIDE = { left: .05, top: .39, width: .9, height: .22 };
export const SHEET_SCAN_GUIDE = { left: .05, top: .15, width: .9, height: .7 };
export function cameraPreviewRegion(width: number, height: number) {
    const visibleWidth = Math.min(width, height * 4 / 3);
    const visibleHeight = visibleWidth * 3 / 4;
    return { x: (width - visibleWidth) / 2, y: (height - visibleHeight) / 2, width: visibleWidth, height: visibleHeight };
}
export function scanRegion(width: number, height: number, guide = SCAN_GUIDE) {
    const visible = cameraPreviewRegion(width, height);
    return { x: visible.x + visible.width * guide.left, y: visible.y + visible.height * guide.top,
        width: visible.width * guide.width, height: visible.height * guide.height };
}

// Confirm the same valid value twice before accepting a live camera reading.
// A stationary barcode stays latched until a different barcode is confirmed.
export function createLiveImeiTracker(normalize: (raw: string) => string = scannedImei, maxIntervalMs = 1200) {
    let candidate = '', hits = 0, lastRead = 0, latched = '';
    return {
        observe(raw: string, now = Date.now()): string | null {
            let value: string;
            try { value = normalize(raw); }
            catch (error) { candidate = ''; hits = 0; throw error; }
            if (value === latched) return null;
            if (value !== candidate || now - lastRead > maxIntervalMs) { candidate = value; hits = 1; }
            else hits++;
            lastRead = now;
            if (hits < 2) return null;
            latched = value; candidate = ''; hits = 0;
            return value;
        },
        reset() { candidate = ''; hits = 0; lastRead = 0; latched = ''; },
    };
}

// Keep fast confirmation responsive while giving slower devices time to render and cool.
export function nextScanDelay(elapsedMs: number, confirming = false) {
    const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    return Math.max(60, (confirming ? 100 : 180) - elapsed, Math.min(600, elapsed * 2));
}

export function parseSupplierImeis(raw: string): { imeis: string[]; excludedSecondary: number; labelled: boolean } {
    if (!raw || raw.length > 128000) throw new Error('This supplier code is empty or too large. Use the supplier IMEI list.');
    const text = raw.trim(), primary: string[] = [];
    let excludedSecondary = 0, labelled = false;
    const add = (value: unknown) => {
        if (typeof value !== 'string') throw new Error('IMEIs must be stored as text in the supplier code.');
        primary.push(scannedImei(value.trim()));
    };
    if (/^[{[]/.test(text)) {
        let data: unknown;
        try { data = JSON.parse(text); } catch { throw new Error('The supplier code contains incomplete JSON. Scan it again or import the supplier list.'); }
        const walk = (value: unknown, accepted = false, depth = 0) => {
            if (depth > 12) throw new Error('Supplier data is nested too deeply. Import a plain IMEI list.');
            if (Array.isArray(value)) { value.forEach(item => walk(item, accepted, depth + 1)); return; }
            if (value && typeof value === 'object') {
                for (const [key, child] of Object.entries(value)) {
                    const name = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (/^(imei2|secondaryimei|secondaryimeis)$/.test(name)) { excludedSecondary += Array.isArray(child) ? child.length : child ? 1 : 0; continue; }
                    const isPrimary = /^(imei|imeis|imei1|primaryimei|primaryimeis|serialnumbers)$/.test(name);
                    if (isPrimary) labelled = true;
                    if (isPrimary || typeof child === 'object') walk(child, isPrimary, depth + 1);
                }
                return;
            }
            if (accepted) add(value);
        };
        walk(data, Array.isArray(data));
    } else {
        const lines = text.split(/[\r\n\x1e]+/).map(line => line.trim()).filter(Boolean);
        const fields = (line: string) => line.split(/[,;\t|]/).map(value => value.trim().replace(/^"|"$/g, ''));
        const headerAt = lines.findIndex(line => fields(line).some(field => /^(imei|imei1|primaryimei)$/i.test(field.replace(/[^a-z0-9]/gi, ''))));
        if (headerAt >= 0 && fields(lines[headerAt]).length > 1 && !/\d{15}/.test(lines[headerAt])) {
            labelled = true;
            const headers = fields(lines[headerAt]).map(value => value.replace(/[^a-z0-9]/gi, '').toLowerCase());
            const index = headers.findIndex(value => /^(imei|imei1|primaryimei)$/.test(value)), secondary = headers.indexOf('imei2');
            for (const row of lines.slice(headerAt + 1)) {
                const cells = fields(row); add(cells[index]);
                if (secondary >= 0 && cells[secondary]) excludedSecondary++;
            }
        } else {
            const matches = [...text.matchAll(/\bIMEI(?:\s*([12]))?(?:\s*[:=]\s*|\s+)([^\s,;|]+)/gi)];
            if (matches.length) {
                labelled = true;
                for (const match of matches) { if (match[1] === '2') excludedSecondary++; else add(match[2]); }
            } else if (/^[\d\s,;|\x1d\x1e]+$/.test(text)) {
                const values = text.split(/[\s,;|\x1d\x1e]+/).filter(Boolean);
                if (values.length === 1 && values[0].length > 15 && values[0].length % 15 === 0) values.splice(0, 1, ...values[0].match(/.{15}/g)!);
                if (values.length === 1 && values[0].length !== 15) throw new Error(`Decoded sheet reference: ${values[0].slice(0, 40)}. This code does not contain an IMEI list. Scan the individual IMEI1 barcodes or use the supplier export.`);
                values.forEach(add);
            } else throw new Error('This code does not contain a supported IMEI list. Use a plain list, IMEI1/IMEI2-labelled data, CSV or JSON from the supplier.');
        }
    }
    if (!primary.length) throw new Error('No primary IMEIs were encoded in this code. A Total/reference number cannot be used to reconstruct phone IMEIs.');
    if (primary.length > 500) throw new Error('Import up to 500 phones at a time. Split this supplier batch.');
    if (new Set(primary).size !== primary.length) throw new Error('The supplier code repeats a primary IMEI. Correct the supplier list before importing.');
    return { imeis: primary, excludedSecondary, labelled };
}
export function normalizeScannedSaleCode(raw: string) {
    return scannedImei(raw);
}
