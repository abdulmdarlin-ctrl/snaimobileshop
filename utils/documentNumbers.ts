export interface DocumentCounter { invoice?: number; receipt?: number; }
export function documentSeries(now = Date.now()) {
    const year = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Kampala', year: 'numeric' }).format(new Date(now));
    return { counterId: `sales-${year}`, year: year.slice(-2) };
}
export function isCompactDocumentNumber(value?: string) {
    return typeof value === 'string' && value.length <= 18 && /^(?:[A-Z][A-Z0-9]{0,7}-)?(?:\d{1,8}|\d{2}-\d{6,})$/i.test(value);
}
export function allocateDocumentNumbers(counter: DocumentCounter, invoice: boolean, receiptCount: number, now = Date.now(), prefix = 'INV') {
    const next = { invoice: counter.invoice ?? 0, receipt: counter.receipt ?? 0 };
    if (![next.invoice, next.receipt].every(value => Number.isSafeInteger(value) && value >= 0) || !Number.isSafeInteger(receiptCount) || receiptCount < 0) throw new Error('Document numbering needs administrator review.');
    const series = documentSeries(now), candidatePrefix = /^[A-Z][A-Z0-9]{0,7}$/i.test(prefix) ? prefix.toUpperCase() : 'INV';
    const normalizedPrefix = candidatePrefix === 'RCT' ? 'INV' : candidatePrefix;
    const format = (kind: string, value: number) => `${kind}-${series.year}-${String(value).padStart(6, '0')}`;
    if (invoice) next.invoice++;
    next.receipt += receiptCount;
    if (!Number.isSafeInteger(next.invoice) || !Number.isSafeInteger(next.receipt) || Math.max(next.invoice, next.receipt) > 999999999) throw new Error('Document numbering limit reached. Contact the administrator.');
    return { counter: next, invoiceNo: invoice ? format(normalizedPrefix, next.invoice) : undefined,
        receipts: Array.from({ length: receiptCount }, (_, index) => format('RCT', next.receipt - receiptCount + index + 1)) };
}

/** Backup restores may raise a sequence floor, but must never rewind issued document numbers. */
export function documentCounterFloors(counters: { id?: string; invoice?: number; receipt?: number }[], sales: any[]) {
    if (!Array.isArray(counters) || !Array.isArray(sales)) throw new Error('Invalid document numbering backup.');
    const floors = new Map<string, { id: string; invoice: number; receipt: number }>();
    const merge = (id: string, invoice: number, receipt: number) => {
        if (!/^sales-\d{4}$/.test(id) || ![invoice, receipt].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 999999999)) throw new Error('Invalid document numbering backup.');
        const old = floors.get(id);
        floors.set(id, { id, invoice: Math.max(old?.invoice || 0, invoice), receipt: Math.max(old?.receipt || 0, receipt) });
    };
    counters.forEach(counter => merge(counter.id || '', counter.invoice ?? 0, counter.receipt ?? 0));
    const reference = (value: unknown) => {
        if (typeof value !== 'string') return;
        const parts = /^([A-Z][A-Z0-9]{0,7})-(\d{2})-(\d{6,9})$/.exec(value);
        if (parts) merge(`sales-20${parts[2]}`, parts[1] === 'RCT' ? 0 : Number(parts[3]), parts[1] === 'RCT' ? Number(parts[3]) : 0);
    };
    for (const sale of sales) {
        if (!sale || typeof sale !== 'object') throw new Error('Invalid sale in numbering backup.');
        [sale.receiptNo, sale.invoiceNo, sale.initialReceiptNo, sale.documentNumbers?.invoice,
            ...Object.values(sale.documentNumbers?.receipts || {}), ...(sale.payments || []).map((payment: any) => payment.receiptNo)].forEach(reference);
    }
    return [...floors.values()];
}
