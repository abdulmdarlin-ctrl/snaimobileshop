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
    return <Modal isOpen onClose={onClose} title={mode === 'invoice' ? 'Sales invoice' : 'Payment receipt'} maxWidth={settings?.receiptFormat === 'a4' ? '2xl' : 'sm'} noPadding>
        <div className="sale-document-switch no-print">
            <label className="text-sm">Document<select className="win-input mt-1" value={mode} onChange={event => setMode(event.target.value as 'invoice' | 'receipt')}><option value="invoice">Sales invoice</option><option value="receipt" disabled={!receipts.length}>Payment receipt</option></select></label>
            {mode === 'receipt' && <label className="text-sm">Payment<select className="win-input mt-1" value={receiptId} onChange={event => setReceiptId(event.target.value)}>{receipts.map(receipt => <option key={receipt.id} value={receipt.id}>{new Date(receipt.timestamp).toLocaleDateString()} - UGX {receipt.amount.toLocaleString()} - {receipt.method}</option>)}</select></label>}
        </div>
        <div className="p-3 bg-slate-100"><SaleDocument id={id} sale={sale} settings={settings} mode={mode} receiptId={receiptId} /></div>
        <div className="p-4 border-t border-slate-200 grid grid-cols-2 gap-2 no-print">
            <button className="win-button" onClick={() => printSection(`#${id}`)}><Printer size={16} /> Print</button>
            {allowExport && <button className="win-button-primary" onClick={() => exportSectionToPDF(`#${id}`, `${mode}-${number}.pdf`)}><Download size={16} /> PDF</button>}
        </div>
    </Modal>;
}
