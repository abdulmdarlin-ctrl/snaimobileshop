import React, { useEffect, useRef, useState } from 'react';
import type { Sale } from '../types';
import { db } from '../db';
import { itemImeis, validateImeis } from '../utils/imei';
import { receivedAmount, outstandingAmount } from '../utils/pos';
import { customerDisplayName, invoiceNumber, paymentReceipts } from '../utils/saleDocuments';
import Modal from './Modal';

export default function PhoneSaleLookup({ isOpen, onClose, history, onDocument }: { isOpen: boolean; onClose: () => void; history: Sale[]; onDocument: (sale: Sale, mode: 'invoice' | 'receipt') => void }) {
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<{ imei: string; sale?: Sale; status: string; productName?: string } | null>(null);
    const request = useRef(0);
    useEffect(() => { request.current++; setBusy(false); setQuery(''); setError(''); setResult(null); return () => { request.current++; }; }, [isOpen]);
    const lookup = async (event: React.FormEvent) => {
        event.preventDefault();
        const token = ++request.current;
        setError(''); setResult(null); setBusy(true);
        try {
            // Historical manual records may predate scanner checksum validation.
            const imei = query.trim();
            validateImeis([imei], 1);
            const found = await db.lookupPhoneImei(imei);
            const legacy = found.status === 'Not found' ? history.filter(sale => sale.items.some(item => itemImeis(item).includes(imei))) : [];
            if (legacy.length > 1) throw new Error('Multiple historical sales contain this IMEI. Review the records before relying on this result.');
            if (token === request.current) setResult({ ...found, imei, ...(legacy.length === 1 ? { sale: legacy[0], status: 'Sold' } : {}) });
        } catch (failure) { if (token === request.current) setError(failure instanceof Error ? failure.message : 'Could not retrieve this phone. Try again.'); }
        finally { if (token === request.current) setBusy(false); }
    };
    const sale = result?.sale;
    return <Modal isOpen={isOpen} onClose={onClose} title="Phone IMEI lookup" maxWidth="2xl">
        <form onSubmit={lookup} className="space-y-3"><label className="block text-sm">Primary phone IMEI<input required className="win-input mt-2" inputMode="numeric" maxLength={15} value={query} onChange={event => { request.current++; setBusy(false); setQuery(event.target.value.replace(/\D/g, '')); setResult(null); setError(''); }} placeholder="Enter or scan 15 digits" /></label><button type="submit" className="win-button-primary w-full" disabled={busy || query.length !== 15}>{busy ? 'Looking up phone...' : 'Look up phone'}</button></form>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        {result && !sale && <div role="status" className="mt-4 rounded-xl border border-slate-200 p-4"><strong>{result.status === 'Available' ? 'Phone is in stock' : result.status === 'Removed' ? 'Phone removed from inventory' : 'No recorded phone found'}</strong><p>{result.productName}</p><p>IMEI: {result.imei}</p><p className="text-sm mt-2">{result.status === 'Available' ? 'This phone has no current completed sale.' : 'Check the IMEI. Older sales without recorded serial numbers cannot be matched.'}</p></div>}
        {sale && <div className="imei-sale-result mt-5 space-y-4">
            <section className="rounded-xl border border-slate-200 p-4 space-y-2"><h3 className="font-semibold">Original sale found</h3><p className="break-all">IMEI: {result!.imei}</p><p>{invoiceNumber(sale)}</p><p>{new Date(sale.timestamp).toLocaleString()}</p><p>Customer: <strong>{customerDisplayName(sale)}</strong> {sale.customerKind === 'Walk-in' && '(Walk-in)'}</p>{sale.customerPhone && <p>Phone: {sale.customerPhone}</p>}<p>Attendant: {sale.cashierName}</p></section>
            {sale.items.filter(item => itemImeis(item).includes(result!.imei)).map((item, index) => <section key={index} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h3 className="font-semibold">{item.name}</h3><p>Unit selling price: UGX {item.price.toLocaleString()}</p><p>{item.warrantyEndDate ? `Warranty ${item.warrantyEndDate >= Date.now() ? 'valid until' : 'expired on'} ${new Date(item.warrantyEndDate).toLocaleDateString()}` : 'No warranty recorded'}</p></section>)}
            <section><h3 className="font-semibold mb-2">Invoice items</h3>{sale.items.map((item, index) => <div key={index} className="py-2 border-b border-slate-100"><p>{item.name} x {item.quantity} - UGX {item.total.toLocaleString()}</p>{itemImeis(item).length > 0 && <p className="text-xs break-all">IMEI: {itemImeis(item).join(', ')}</p>}</div>)}</section>
            <dl className="sale-document-totals"><dt>Sales value</dt><dd>UGX {sale.total.toLocaleString()}</dd><dt>Money received</dt><dd>UGX {receivedAmount(sale).toLocaleString()}</dd><dt>Outstanding</dt><dd>UGX {outstandingAmount(sale).toLocaleString()}</dd></dl>
            <section><h3 className="font-semibold">Payment history</h3>{paymentReceipts(sale).map(receipt => <p key={receipt.id} className="text-sm py-2 break-all">{receipt.receiptNo}<br />{new Date(receipt.timestamp).toLocaleString()} - {receipt.method} - UGX {receipt.amount.toLocaleString()}{receipt.reference && ` - ${receipt.reference}`}</p>)}{!paymentReceipts(sale).length && <p>No payments received.</p>}</section>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><button className="win-button-primary" onClick={() => onDocument(sale, 'invoice')}>View sales invoice</button>{paymentReceipts(sale).length > 0 && <button className="win-button" onClick={() => onDocument(sale, 'receipt')}>View payment receipts</button>}</div>
        </div>}
    </Modal>;
}
