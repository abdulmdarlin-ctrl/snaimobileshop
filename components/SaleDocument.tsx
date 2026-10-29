import React from 'react';
import SnaiLogo from '../assets/SNAI-LOGO.png';
import type { AppSettings, Sale } from '../types';
import { itemImeis } from '../utils/imei';
import { money } from '../utils/pos';
import { customerDisplayName, invoiceNumber, paymentReceipts } from '../utils/saleDocuments';
import { formatSaleDate } from '../utils/saleDetails';
import { isCompactDocumentNumber } from '../utils/documentNumbers';

const decimal = (value: number) => money(value).toFixed(2);
const rate = (value: number) => money(value).toLocaleString('en', { useGrouping: false, maximumFractionDigits: 2 });
const documentDate = (timestamp: number) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(timestamp));
    const get = (name: string) => parts.find(part => part.type === name)?.value || '';
    return `${get('day')}-${get('month')}-${get('year')} ${Number(get('hour'))}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
};
export default function SaleDocument({ sale, settings, mode = 'invoice', receiptId, id }: {
    sale: Sale; settings: AppSettings | null; mode?: 'invoice' | 'receipt'; receiptId?: string; id?: string;
}) {
    const receipts = paymentReceipts(sale);
    const receipt = receiptId ? receipts.find(row => row.id === receiptId) : receipts[receipts.length - 1];
    const invoice = mode === 'invoice';
    if (!invoice && !receipt) return <p role="status">No payment has been received for this receipt. Use the invoice for this sale.</p>;
    const number = invoice ? invoiceNumber(sale) : receipt!.receiptNo;
    if (!isCompactDocumentNumber(number)) return <p role="status">Preparing a short document number. Open this document from sales history.</p>;
    const paper = settings?.hardware?.printerPaperWidth === '58mm' ? 58 : 80;
    const total = invoice ? sale.total : receipt!.amount;
    const change = !invoice && receipt!.id === 'initial' && receipt!.method === 'Cash' ? sale.changeDue ?? Math.max(0, sale.amountPaid - sale.total) : 0;
    return <article id={id} data-paper-width={paper} data-document-kind={mode} className={`sale-document sale-document-reference ${settings?.receiptFormat === 'a4' ? 'receipt-a4-mode' : 'receipt-mode'}`} style={{ maxWidth: settings?.receiptFormat === 'a4' ? '210mm' : `${paper}mm`, fontFamily: settings?.receiptFont === 'serif' ? 'Georgia, serif' : settings?.receiptFont === 'monospace' ? 'monospace' : 'Arial, sans-serif', fontSize: settings?.receiptFontSize || 11, lineHeight: settings?.receiptLineHeight || 1.45 }}>
        <header className="document-business" aria-label="Business details">
            <img className="document-business-logo" src={settings?.logo?.trim() || SnaiLogo} alt={`${settings?.businessName?.trim() || 'SNA! MOBILE SHOP'} logo`} crossOrigin="anonymous" onError={event => { if (event.currentTarget.getAttribute('src') !== SnaiLogo) event.currentTarget.src = SnaiLogo; }} />
            <h2>{settings?.businessName?.trim() || 'SNA! MOBILE SHOP'}</h2>
            {settings?.address?.trim() && <p>{settings.address.trim()}</p>}
            {settings?.phone?.trim() && <p>Tel: {settings.phone.trim()}</p>}
            {settings?.tin?.trim() && <p>TIN: {settings.tin.trim()}</p>}
        </header>
        <h1 className="document-title">{invoice ? 'INVOICE' : 'RECEIPT'}</h1>
        <div className="document-meta"><time dateTime={new Date(invoice ? sale.timestamp : receipt!.timestamp).toISOString()}>{documentDate(invoice ? sale.timestamp : receipt!.timestamp)}</time><span>{invoice ? 'Invoice' : 'Receipt'} : <strong>{number}</strong></span></div>
        <section className="document-customer"><h2>Customer Details :</h2><p>{customerDisplayName(sale)}</p>{sale.customerPhone && <p>Contact : {sale.customerPhone}</p>}{sale.customerAddress && <p>{sale.customerAddress}</p>}{invoice && sale.dueDate && <p>Due : {formatSaleDate(sale.dueDate)}</p>}</section>
        {invoice ? <>
            <table className="document-items"><colgroup><col style={{ width: '40%' }} /><col style={{ width: '10%' }} /><col style={{ width: '23%' }} /><col style={{ width: '27%' }} /></colgroup><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>
                {sale.items.map((item, index) => <tr key={index}><td><span>{item.name}</span>{itemImeis(item).map(imei => <small key={imei}>IMEI: {imei}</small>)}</td><td>{item.quantity}</td><td>{rate(item.price)}</td><td>{rate(item.total)}</td></tr>)}
            </tbody></table>
            <div className="document-line-sum">UGX {decimal(money(sale.items.reduce((sum, item) => sum + item.total, 0)))}</div>
            <div className="document-subtotal"><span>Items : {sale.items.length}</span><span>Sub Total <strong>UGX {decimal(sale.subtotal)}</strong></span></div>
            {(sale.discount > 0 || !!sale.tax) && <dl className="document-adjustments">{sale.discount > 0 && <><dt>Discount</dt><dd>UGX {decimal(sale.discount)}</dd></>}{!!sale.tax && settings?.receiptShowTaxDetail !== false && <><dt>Taxes</dt><dd>UGX {decimal(sale.tax)}</dd></>}</dl>}
        </> : <>
            <table className="document-payment"><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody><tr><td>Payment received</td><td>UGX {decimal(receipt!.amount)}</td></tr></tbody></table>
            <dl className="document-payment-details"><dt>Payment method</dt><dd>{receipt!.method}</dd>{receipt!.reference && <><dt>Transaction reference</dt><dd>{receipt!.reference}</dd></>}{settings?.receiptShowCashier !== false && <><dt>Received by</dt><dd>{receipt!.user || 'Attendant'}</dd></>}{change > 0 && <><dt>Cash tendered</dt><dd>UGX {decimal(money(receipt!.amount + change))}</dd><dt>Change returned</dt><dd>UGX {decimal(change)}</dd></>}</dl>
        </>}
        <div className="document-grand-total"><span>{invoice ? 'Total' : 'Total received'} :</span><strong>{decimal(total)}</strong></div>
        {!invoice && settings?.receiptFooter && <footer className="document-footer" style={{ fontSize: settings.receiptFooterFontSize || 10, fontWeight: settings.receiptFooterBold ? 'bold' : 'normal', fontStyle: settings.receiptFooterItalic ? 'italic' : 'normal', textAlign: settings.receiptFooterAlign || 'center' }}>{settings.receiptFooter}</footer>}
    </article>;
}
