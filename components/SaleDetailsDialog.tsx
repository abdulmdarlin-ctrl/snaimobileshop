import React, { useEffect, useId, useRef, useState } from 'react';
import { FileText, Receipt, ScanBarcode, MoreHorizontal, X, Plus, Pencil } from 'lucide-react';
import type { Sale } from '../types';
import { itemImeis } from '../utils/imei';
import { money, outstandingAmount, receivedAmount, getSaleType } from '../utils/pos';
import { customerDisplayName, invoiceNumber, paymentReceipts } from '../utils/saleDocuments';
import { formatSaleDate, saleDateInput, validateSaleDetails } from '../utils/saleDetails';
import { confirmAction } from '../utils/dialog';
import Modal from './Modal';

type Tab = 'items' | 'payments' | 'details';
interface Props {
    sale: Sale; isOpen: boolean; canEdit: boolean; onClose: () => void;
    onEdit: (sale: Sale, itemIndex?: number) => void; onAddItem: (sale: Sale) => void; onScanItem: (sale: Sale) => void;
    onPayment: (sale: Sale) => void; onDocument: (sale: Sale, mode: 'invoice' | 'receipt', receiptId?: string) => void;
    onSaveDetails: (sale: Sale, dueDate: string, notes: string) => Promise<void>;
    initialTab?: Tab;
}
const amount = (value: number) => money(value || 0).toLocaleString('en-UG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SaleDetailsDialog({ sale, isOpen, canEdit, onClose, onEdit, onAddItem, onScanItem, onPayment, onDocument, onSaveDetails, initialTab = 'items' }: Props) {
    const [tab, setTab] = useState<Tab>(initialTab), [line, setLine] = useState<number | null>(null);
    const [dueDate, setDueDate] = useState(sale.dueDate || ''), [notes, setNotes] = useState(sale.notes || '');
    const [saving, setSaving] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('');
    const saveLock = useRef(false), root = useRef<HTMLDivElement>(null), id = useId();
    const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
    const due = outstandingAmount(sale), receipts = paymentReceipts(sale);
    const dirty = dueDate !== (sale.dueDate || '') || notes !== (sale.notes || '');
    useEffect(() => { setDueDate(sale.dueDate || ''); setNotes(sale.notes || ''); setError(''); setLine(null); }, [sale.id, sale.revision]);
    const cancelHold = () => { if (hold.current) clearTimeout(hold.current.timer); hold.current = null; };
    useEffect(() => () => cancelHold(), []);
    useEffect(() => {
        if (!isOpen) return;
        const previous = document.activeElement as HTMLElement | null;
        const timer = setTimeout(() => root.current?.querySelector<HTMLButtonElement>('.sale-details-close')?.focus(), 0);
        return () => { clearTimeout(timer); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
    }, [isOpen]);
    async function leave(action: () => void) {
        if (saveLock.current) return;
        if (dirty && !await confirmAction({ title: 'Discard unsaved sale details?', message: 'The due date and notes have not been saved.', confirmLabel: 'Discard changes', tone: 'danger' })) return;
        if (dirty) { setDueDate(sale.dueDate || ''); setNotes(sale.notes || ''); }
        setError(''); setSaved(''); action();
    }
    async function save(event: React.FormEvent) {
        event.preventDefault();
        if (saveLock.current || !canEdit) return;
        saveLock.current = true;
        try {
            const details = validateSaleDetails(sale, dueDate, notes);
            if (!await confirmAction({ title: 'Save sale details?', message: 'Update the payment due date and internal notes for this invoice.', confirmLabel: 'Save details', details: [{ label: 'Invoice', value: invoiceNumber(sale) }, { label: 'Due date', value: formatSaleDate(details.dueDate) }] })) return;
            saveLock.current = true; setSaving(true); setError(''); setSaved('');
            await onSaveDetails(sale, details.dueDate, details.notes);
            setDueDate(details.dueDate); setNotes(details.notes); setSaved('Sale details saved.');
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save sale details.'); }
        finally { saveLock.current = false; setSaving(false); }
    }
    return <Modal isOpen={isOpen} onClose={() => { void leave(onClose); }} ariaLabel={`Sale details ${invoiceNumber(sale)}`} maxWidth="4xl" noPadding contentClassName="sale-details-dialog">
        <div className="sale-details" ref={root} onKeyDown={event => {
            if (event.key !== 'Tab') return;
            const controls = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter(element => element.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
            <header className="sale-details-header">
                <div className="sale-details-customer"><h2>{customerDisplayName(sale)}</h2><p>{due > 0 ? 'Pending Payment' : 'Paid in Full'}</p></div>
                <dl className="sale-details-dates"><div><dt>Date:</dt><dd>{formatSaleDate(sale.timestamp)}</dd></div><div><dt>Due:</dt><dd>{formatSaleDate(sale.dueDate)}</dd></div></dl>
                <button type="button" className="sale-details-close" aria-label="Close sale details" disabled={saving} onClick={() => { void leave(onClose); }}><X size={21} /></button>
            </header>
            <div className="sale-details-tabs" role="tablist" aria-label="Sale information" onKeyDown={event => {
                const tabs: Tab[] = ['items', 'payments', 'details'];
                const index = tabs.indexOf(tab);
                const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1;
                if (next >= 0) { event.preventDefault(); void leave(() => { setTab(tabs[next]); document.getElementById(`${id}-tab-${tabs[next]}`)?.focus(); }); }
            }}>
                {(['items', 'payments', 'details'] as Tab[]).map(value => <button type="button" key={value} role="tab" id={`${id}-tab-${value}`} aria-controls={`${id}-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => { if (tab !== value) void leave(() => setTab(value)); }}>{value === 'items' ? 'Items' : value === 'payments' ? 'Payments' : 'Details'}</button>)}
            </div>
            <div className="sale-details-scroll custom-scrollbar">
                <section role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-tab-${tab}`} tabIndex={0}>
                {tab === 'items' && <>
                    <div className="sale-details-summary">
                        <dl><div><dt>Sub Total:</dt><dd>{amount(sale.subtotal)}</dd></div><div><dt>Discount:</dt><dd>{amount(sale.discount)}</dd></div><div><dt>Shipping:</dt><dd>{amount(0)}</dd></div><div><dt>Taxes:</dt><dd>{amount(sale.tax || 0)}</dd></div><div className="sale-details-grand-total"><dt>TOTAL:</dt><dd>{amount(sale.total)}</dd></div></dl>
                        {canEdit && <div className="sale-details-item-actions"><button type="button" aria-label="Scan phone IMEI to add an item" title="Scan phone IMEI" onClick={() => { void leave(() => onScanItem(sale)); }}><ScanBarcode size={32} strokeWidth={1.5} /></button><button type="button" onClick={() => { void leave(() => onAddItem(sale)); }}>Add Item</button></div>}
                    </div>
                    <table className="sale-details-items"><colgroup><col className="sale-details-qty-col" /><col /><col className="sale-details-amount-col" /></colgroup><thead><tr><th scope="col">Qty</th><th scope="col">Description</th><th scope="col">Amount</th></tr></thead>
                        <tbody><tr className="sale-details-hint"><td colSpan={3}>To see more options, long-hold on one line.</td></tr>
                        {sale.items.map((item, index) => <React.Fragment key={`${item.productId}-${index}`}>
                            <tr className="sale-details-item" onPointerDown={event => {
                                if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
                                cancelHold(); hold.current = { x: event.clientX, y: event.clientY, timer: setTimeout(() => { setLine(index); cancelHold(); }, 550) };
                            }} onPointerMove={event => { if (hold.current && Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 10) cancelHold(); }} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold} onContextMenu={event => { event.preventDefault(); setLine(index); }}>
                                <td>{item.quantity}</td><td><strong>{item.name}</strong></td><td><div><span>{amount(item.total ?? item.price * item.quantity)}</span><button type="button" aria-label={`Options for ${item.name}`} aria-expanded={line === index} aria-controls={`${id}-line-${index}`} onClick={() => setLine(line === index ? null : index)}><MoreHorizontal size={18} /></button></div></td>
                            </tr>
                            {line === index && <tr className="sale-details-line-info"><td colSpan={3}><div id={`${id}-line-${index}`}><div className="sale-details-line-heading"><strong>{item.name}</strong><button type="button" aria-label="Close item options" onClick={() => setLine(null)}><X size={18} /></button></div><p>Quantity: {item.quantity} / Unit price: UGX {amount(item.price)}</p>{itemImeis(item).length > 0 && <div className="sale-details-imeis"><span>Phone IMEIs</span>{itemImeis(item).map(imei => <code key={imei}>{imei}</code>)}</div>}{canEdit && <button type="button" className="sale-details-button" onClick={() => { void leave(() => onEdit(sale, index)); }}><Pencil size={16} />Edit item</button>}</div></td></tr>}
                        </React.Fragment>)}
                        </tbody>
                    </table>
                </>}
                {tab === 'payments' && <div className="sale-details-tab-content">
                    <dl className="sale-details-payment-totals"><div><dt>Invoice total</dt><dd>UGX {amount(sale.total)}</dd></div><div><dt>Money received</dt><dd>UGX {amount(receivedAmount(sale))}</dd></div><div><dt>Outstanding</dt><dd>UGX {amount(due)}</dd></div></dl>
                    {due > 0 && <button type="button" className="sale-details-button sale-details-button-primary" onClick={() => { void leave(() => onPayment(sale)); }}><Plus size={17} />Record payment</button>}
                    <h3 className="sale-details-section-title">Payment history</h3>
                    {receipts.length ? <ol className="sale-details-payments">{receipts.map(receipt => <li key={receipt.id}><div><strong>UGX {amount(receipt.amount)}</strong><span>{formatSaleDate(receipt.timestamp)} / {receipt.method}</span><small>Received by {receipt.user || 'Attendant'}{receipt.reference ? ` / Ref: ${receipt.reference}` : ''}</small><small>Balance after payment: UGX {amount(receipt.balanceAfter)}</small></div><button type="button" className="sale-details-button" onClick={() => { void leave(() => onDocument(sale, 'receipt', receipt.id)); }}><Receipt size={16} />Receipt</button></li>)}</ol> : <p className="sale-details-empty">No payment has been recorded for this invoice.</p>}
                </div>}
                {tab === 'details' && <div className="sale-details-tab-content">
                    <dl className="sale-details-account"><dt>Invoice number</dt><dd>{invoiceNumber(sale)}</dd><dt>Customer</dt><dd>{customerDisplayName(sale)}{sale.customerKind === 'Walk-in' && <small>Walk-in customer</small>}</dd><dt>Phone</dt><dd>{sale.customerPhone || 'Not recorded'}</dd><dt>Sale type</dt><dd>{getSaleType(sale)}</dd><dt>Pricing</dt><dd>{sale.customerType || 'Retail'}</dd><dt>Attendant</dt><dd>{sale.cashierName}</dd><dt>Shipping</dt><dd>No shipping charge recorded</dd></dl>
                    {canEdit ? <form className="sale-details-form" onSubmit={save}>
                        <label>Payment due date<input type="date" className="win-input" min={saleDateInput(sale.timestamp)} value={dueDate} disabled={saving} onChange={event => { setDueDate(event.target.value); setSaved(''); }} /></label>
                        <label>Internal notes<textarea className="win-input" rows={3} maxLength={2000} value={notes} disabled={saving} onChange={event => { setNotes(event.target.value); setSaved(''); }} placeholder="Add delivery instructions or an account note" /></label>
                        {error && <p role="alert" className="sale-details-error">{error}</p>}{saved && <p role="status">{saved}</p>}
                        <div className="sale-details-form-actions"><button type="submit" className="sale-details-button sale-details-button-primary" disabled={saving || !dirty}>{saving ? 'Saving...' : 'Save details'}</button><button type="button" className="sale-details-button" disabled={saving} onClick={() => { void leave(() => onEdit(sale)); }}><Pencil size={16} />Edit invoice</button></div>
                    </form> : <dl className="sale-details-account"><dt>Internal notes</dt><dd className="sale-details-note">{sale.notes || 'No notes recorded'}</dd></dl>}
                </div>}
                </section>
            </div>
            <footer className="sale-details-footer"><span>Amounts in UGX</span><div><button type="button" className="sale-details-button" onClick={() => { void leave(() => onDocument(sale, 'invoice')); }}><FileText size={17} />Invoice</button><button type="button" className="sale-details-button" disabled={!receipts.length} onClick={() => { void leave(() => onDocument(sale, 'receipt')); }}><Receipt size={17} />Receipts</button></div></footer>
        </div>
    </Modal>;
}
