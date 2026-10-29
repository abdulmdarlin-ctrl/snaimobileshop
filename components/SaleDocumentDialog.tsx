import { db } from '../db';
import { databaseErrorMessage } from '../utils/databaseErrors';
import React, { useEffect, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { AppSettings, Sale } from '../types';
import { invoiceNumber, paymentReceipts, missingDocumentNumbers } from '../utils/saleDocuments';
import { printSection, exportSectionToPDF } from '../utils/printExport';
import Modal from './Modal';
import SaleDocument from './SaleDocument';

export default function SaleDocumentDialog({ sale: sourceSale, settings, onClose, onPrepared, initialMode = 'invoice', initialReceiptId, allowExport = true, id = 'sale-document' }: {
    sale: Sale; settings: AppSettings | null; onClose: () => void; onPrepared?: (sale: Sale) => void; initialMode?: 'invoice' | 'receipt'; initialReceiptId?: string; allowExport?: boolean; id?: string;
}) {
    const exportLock = useRef(false);
    const prepared = useRef(onPrepared); prepared.current = onPrepared;
    const [sale, setSale] = useState(sourceSale);
    const [preparing, setPreparing] = useState(true), [numberError, setNumberError] = useState(''), [retry, setRetry] = useState(0), [exporting, setExporting] = useState(false);
    useEffect(() => {
        let active = true;
        setSale(sourceSale); setNumberError('');
        const missing = missingDocumentNumbers(sourceSale);
        if (!missing.invoice && !missing.receipts.length) { setPreparing(false); return; }
        setPreparing(true);
        if (!sourceSale.id) { setNumberError('This document has no saved sale reference. Reopen it from sales history.'); setPreparing(false); return; }
        void db.ensureSaleDocumentNumbers(sourceSale.id).then(value => { if (active) { setSale(value); prepared.current?.(value); } })
            .catch(error => { if (active) setNumberError(databaseErrorMessage(error, 'Could not prepare the document number. Please retry.')); })
            .finally(() => { if (active) setPreparing(false); });
        return () => { active = false; };
    }, [sourceSale, retry]);
    const receipts = paymentReceipts(sale);
    const [mode, setMode] = useState(initialMode);
    const [receiptId, setReceiptId] = useState(initialReceiptId || receipts[receipts.length - 1]?.id || 'initial');
    useEffect(() => { setMode(initialMode === 'receipt' && !receipts.length ? 'invoice' : initialMode); setReceiptId(initialReceiptId || receipts[receipts.length - 1]?.id || 'initial'); }, [sale.id, initialMode, initialReceiptId]);
    const number = mode === 'invoice' ? invoiceNumber(sale) : receipts.find(row => row.id === receiptId)?.receiptNo;
    const unavailable = preparing || !!numberError || exporting || sale.id !== sourceSale.id || (mode === 'receipt' && !receipts.some(receipt => receipt.id === receiptId));
    return <Modal isOpen busy={exporting} onClose={onClose} title={mode === 'invoice' ? 'Sales invoice' : 'Payment receipt'} maxWidth={settings?.receiptFormat === 'a4' ? '2xl' : 'sm'} noPadding contentClassName="sale-document-dialog">
        <div className="sale-document-dialog-scroll custom-scrollbar">
        <div className="sale-document-switch no-print">
            <label className="text-sm">Document<select aria-label="Document type" disabled={exporting} className="win-input mt-1" value={mode} onChange={event => setMode(event.target.value as 'invoice' | 'receipt')}><option value="invoice">Sales invoice</option><option value="receipt" disabled={!receipts.length}>Payment receipt</option></select></label>
            {mode === 'receipt' && <label className="text-sm">Payment<select aria-label="Payment receipt" disabled={exporting} className="win-input mt-1" value={receiptId} onChange={event => setReceiptId(event.target.value)}>{receipts.map(receipt => <option key={receipt.id} value={receipt.id}>{new Date(receipt.timestamp).toLocaleDateString()} - UGX {receipt.amount.toLocaleString()} - {receipt.method}</option>)}</select></label>}
        </div>
        <div className="p-3 bg-slate-100">{preparing ? <p role="status" className="p-4 text-sm">Preparing document number...</p> : numberError ? <div role="alert" className="p-4 space-y-3 text-sm"><p>{numberError}</p><button type="button" className="dialog-button" onClick={() => setRetry(value => value + 1)}>Retry</button></div> : <SaleDocument id={id} sale={sale} settings={settings} mode={mode} receiptId={receiptId} />}</div>
        </div>
        <footer className={`sale-document-actions no-print${allowExport ? '' : ' sale-document-actions-single'}`} aria-label="Document actions">
            <button type="button" className="sale-document-action" disabled={unavailable} onClick={() => printSection(`#${id}`)}><Printer size={18} aria-hidden="true" /><span>Print</span></button>
            {allowExport && <button type="button" className="sale-document-action sale-document-action-primary" disabled={unavailable} onClick={async () => { if (exportLock.current) return; exportLock.current = true; setExporting(true); try { await exportSectionToPDF(`#${id}`, `${mode}-${number}.pdf`); } finally { exportLock.current = false; setExporting(false); } }}><Download size={18} aria-hidden="true" /><span aria-live="polite">{exporting ? 'Saving PDF...' : 'Save PDF'}</span></button>}
        </footer>
    </Modal>;
}
