import React, { useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { AppSettings, Sale } from '../types';
import { invoiceNumber, paymentReceipts } from '../utils/saleDocuments';
import { printSection, exportSectionToPDF } from '../utils/printExport';
import Modal from './Modal';
import SaleDocument from './SaleDocument';

export default function SaleDocumentDialog({ sale, settings, onClose, initialMode = 'invoice', initialReceiptId, allowExport = true, id = 'sale-document' }: {
    sale: Sale; settings: AppSettings | null; onClose: () => void; initialMode?: 'invoice' | 'receipt'; initialReceiptId?: string; allowExport?: boolean; id?: string;
}) {
    const receipts = paymentReceipts(sale);
    const [mode, setMode] = useState(initialMode);
    const [receiptId, setReceiptId] = useState(initialReceiptId || receipts[receipts.length - 1]?.id || 'initial');
    useEffect(() => { setMode(initialMode === 'receipt' && !receipts.length ? 'invoice' : initialMode); setReceiptId(initialReceiptId || receipts[receipts.length - 1]?.id || 'initial'); }, [sale.id, initialMode, initialReceiptId]);
    const number = mode === 'invoice' ? invoiceNumber(sale) : receipts.find(row => row.id === receiptId)?.receiptNo;
    return <Modal isOpen onClose={onClose} title={mode === 'invoice' ? 'Sales invoice' : 'Payment receipt'} maxWidth={settings?.receiptFormat === 'a4' ? '2xl' : 'sm'} noPadding contentClassName="sale-document-dialog">
        <div className="sale-document-dialog-scroll custom-scrollbar">
        <div className="sale-document-switch no-print">
            <label className="text-sm">Document<select className="win-input mt-1" value={mode} onChange={event => setMode(event.target.value as 'invoice' | 'receipt')}><option value="invoice">Sales invoice</option><option value="receipt" disabled={!receipts.length}>Payment receipt</option></select></label>
            {mode === 'receipt' && <label className="text-sm">Payment<select className="win-input mt-1" value={receiptId} onChange={event => setReceiptId(event.target.value)}>{receipts.map(receipt => <option key={receipt.id} value={receipt.id}>{new Date(receipt.timestamp).toLocaleDateString()} - UGX {receipt.amount.toLocaleString()} - {receipt.method}</option>)}</select></label>}
        </div>
        <div className="p-3 bg-slate-100"><SaleDocument id={id} sale={sale} settings={settings} mode={mode} receiptId={receiptId} /></div>
        </div>
        <footer className={`sale-document-actions no-print${allowExport ? '' : ' sale-document-actions-single'}`} aria-label="Document actions">
            <button type="button" className="sale-document-action" onClick={() => printSection(`#${id}`)}><Printer size={18} aria-hidden="true" /><span>Print</span></button>
            {allowExport && <button type="button" className="sale-document-action sale-document-action-primary" onClick={() => exportSectionToPDF(`#${id}`, `${mode}-${number}.pdf`)}><Download size={18} aria-hidden="true" /><span>Save PDF</span></button>}
        </footer>
    </Modal>;
}
