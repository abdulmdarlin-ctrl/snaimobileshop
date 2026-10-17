import React from 'react';
import type { AppSettings, Sale } from '../types';
import { itemImeis } from '../utils/imei';
import { receivedAmount, outstandingAmount } from '../utils/pos';
import { customerDisplayName, invoiceNumber, paymentReceipts } from '../utils/saleDocuments';
import SnaiLogo from '../assets/SNAI-LOGO.png';

export default function SaleDocument({ sale, settings, mode = 'invoice', receiptId, id }: {
    sale: Sale; settings: AppSettings | null; mode?: 'invoice' | 'receipt'; receiptId?: string; id?: string;
}) {
    const receipts = paymentReceipts(sale);
    const receipt = receipts.find(row => row.id === receiptId) || receipts[receipts.length - 1];
    const cash = (amount: number) => `UGX ${amount.toLocaleString()}`;
    if (mode === 'receipt' && !receipt) return <p role="status">No payment has been received. Use the invoice for this sale.</p>;
    return <article id={id} className={`sale-document ${settings?.receiptFormat === 'a4' ? 'receipt-a4-mode' : 'receipt-mode'}`} style={{ maxWidth: settings?.receiptFormat === 'a4' ? '210mm' : '80mm', fontFamily: settings?.receiptFont === 'serif' ? 'serif' : settings?.receiptFont === 'monospace' ? 'monospace' : 'sans-serif', fontSize: settings?.receiptFontSize || 11, lineHeight: settings?.receiptLineHeight || 1.4 }}>
        <header>
            {settings?.receiptShowLogo !== false && <img src={SnaiLogo} alt="Sna! Mobile Shop" />}
            <h2>{settings?.receiptHeader || settings?.businessName || 'SNA! MOBILE SHOP'}</h2>
            <p>{settings?.address || 'KYAZANGA OPP STABEX PETROL STATION'}</p>
            <p>Tel: {settings?.phone || '+256 756337888 | +256 778413197'}</p>
            <h3>{mode === 'invoice' ? 'SALES INVOICE' : 'PAYMENT RECEIPT'}</h3>
        </header>
        <dl>
            {mode === 'receipt' && <><dt>Receipt number</dt><dd>{receipt!.receiptNo}</dd></>}
            <dt>Invoice number</dt><dd>{invoiceNumber(sale)}</dd>
            <dt>{mode === 'receipt' ? 'Payment date' : 'Sale date'}</dt><dd>{new Date(mode === 'receipt' ? receipt!.timestamp : sale.timestamp).toLocaleString()}</dd>
            <dt>Customer</dt><dd>{customerDisplayName(sale)}</dd>
            {sale.customerPhone && <><dt>Phone</dt><dd>{sale.customerPhone}</dd></>}
            <dt>{mode === 'receipt' ? 'Received by' : 'Attendant'}</dt><dd>{mode === 'receipt' ? receipt!.user : sale.cashierName}</dd>
        </dl>
        {mode === 'invoice' ? <>
            <table><thead><tr><th>Item / IMEI</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
                {sale.items.map((item, index) => <tr key={index}><td><strong>{item.name}</strong>{itemImeis(item).map(imei => <small key={imei}>IMEI: {imei}</small>)}{item.warrantyEndDate && <small>Warranty ends: {new Date(item.warrantyEndDate).toLocaleDateString()}</small>}</td><td>{item.quantity}</td><td>{item.price.toLocaleString()}</td><td>{item.total.toLocaleString()}</td></tr>)}
            </tbody></table>
            <dl className="sale-document-totals"><dt>Subtotal</dt><dd>{cash(sale.subtotal)}</dd>{sale.discount > 0 && <><dt>Discount</dt><dd>-{cash(sale.discount)}</dd></>}{!!sale.tax && <><dt>Tax</dt><dd>{cash(sale.tax)}</dd></>}<dt><strong>Invoice total</strong></dt><dd><strong>{cash(sale.total)}</strong></dd><dt>Money received</dt><dd>{cash(receivedAmount(sale))}</dd><dt><strong>Outstanding</strong></dt><dd><strong>{cash(outstandingAmount(sale))}</strong></dd></dl>
            <p>Payment status: {outstandingAmount(sale) === 0 ? 'Paid in full' : receivedAmount(sale) > 0 ? 'Partially paid' : 'Unpaid'}</p>
            <p>This invoice records the goods sold. Payment receipts acknowledge individual payments.</p>
        </> : <>
            <p>Payment received against invoice {invoiceNumber(sale)}.</p>
            <dl className="sale-document-totals"><dt><strong>Amount received</strong></dt><dd><strong>{cash(receipt!.amount)}</strong></dd><dt>Payment method</dt><dd>{receipt!.method}</dd>{receipt!.reference && <><dt>Payment reference</dt><dd>{receipt!.reference}</dd></>}<dt>Balance after payment</dt><dd>{cash(receipt!.balanceAfter)}</dd></dl>
            <p>Items on the linked invoice:</p>{sale.items.map((item, index) => <p key={index}>{item.name} x {item.quantity}{itemImeis(item).map(imei => <small key={imei}>IMEI: {imei}</small>)}</p>)}
            {receipt!.id === 'initial' && (sale.changeDue || sale.amountPaid - sale.total) > 0 && <p>Cash tendered: {cash(receipt!.amount + (sale.changeDue || Math.max(0, sale.amountPaid - sale.total)))}<br />Change returned: {cash(sale.changeDue || Math.max(0, sale.amountPaid - sale.total))}</p>}
            <p>This receipt confirms only the payment shown above.</p>
        </>}
        <footer style={{ fontSize: settings?.receiptFooterFontSize || 10, fontWeight: settings?.receiptFooterBold ? 'bold' : 'normal', fontStyle: settings?.receiptFooterItalic ? 'italic' : 'normal', textAlign: settings?.receiptFooterAlign || 'center' }}>{settings?.receiptFooter || 'Thank you for shopping with us!'}</footer>
    </article>;
}
