import type { Sale } from '../types';
import { money, receivedAmount, saleReceipts } from './pos';

export const invoiceNumber = (sale: Sale) => sale.invoiceNo || sale.receiptNo;
export const customerDisplayName = (sale: Sale) => sale.customerKind === 'Walk-in' ? sale.walkInName || 'Walk-in customer' : sale.customerName || 'Walk-in customer';
export const receiptNumber = (saleId: string, paymentId = 'initial') => `RCT-${saleId}-${paymentId}`;

/** Payment receipts never include unpaid balances or cash returned as change. */
export function paymentReceipts(sale: Sale) {
    const rows = saleReceipts(sale);
    const later = (sale.payments || []).filter(p => Number.isFinite(p.amount) && p.amount > 0);
    const initial = money(Math.max(0, receivedAmount(sale) - later.reduce((sum, p) => sum + p.amount, 0)));
    let cumulative = 0;
    return rows.map((row, index) => {
        const payment = initial > 0 && index === 0 ? undefined : later[index - (initial > 0 ? 1 : 0)];
        cumulative = money(cumulative + row.amount);
        return { ...row, id: payment?.id || 'initial',
            receiptNo: payment?.receiptNo || (payment ? receiptNumber(sale.id || sale.receiptNo, payment.id) : sale.initialReceiptNo || receiptNumber(sale.id || sale.receiptNo)),
            balanceAfter: payment?.balanceAfter ?? (!payment ? sale.initialBalanceAfter : undefined) ?? money(Math.max(0, sale.total - cumulative)) };
    });
}
