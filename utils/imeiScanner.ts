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

// Match the central guide in the 4:3, object-fit:cover preview.
export function scanRegion(width: number, height: number) {
    const visibleWidth = Math.min(width, height * 4 / 3);
    const visibleHeight = visibleWidth * 3 / 4;
    const w = visibleWidth * .9, h = visibleHeight * .22;
    return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

// Confirm the same valid value twice before accepting a live camera reading.
// A stationary barcode stays latched until a different barcode is confirmed.
export function createLiveImeiTracker() {
    let candidate = '', hits = 0, lastRead = 0, latched = '';
    return {
        observe(raw: string, now = Date.now()): string | null {
            let value: string;
            try { value = scannedImei(raw); }
            catch (error) { candidate = ''; hits = 0; throw error; }
            if (value === latched) return null;
            if (value !== candidate || now - lastRead > 1200) { candidate = value; hits = 1; }
            else hits++;
            lastRead = now;
            if (hits < 2) return null;
            latched = value; candidate = ''; hits = 0;
            return value;
        },
        reset() { candidate = ''; hits = 0; lastRead = 0; latched = ''; },
    };
}
