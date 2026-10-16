import type { Sale, SaleItem, SaleType } from '../types';

export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function validateItems(items: SaleItem[]) {
    if (!items.length) throw new Error('Add at least one item to the sale.');
    for (const item of items) {
        if (!item.productId || !Number.isSafeInteger(item.quantity) || item.quantity < 1)
            throw new Error('Each item needs a valid product and a whole-number quantity greater than zero.');
        if (!Number.isFinite(item.price) || item.price < 0)
            throw new Error('Item prices must be valid, non-negative amounts.');
    }
}

export function calculateSaleTotals(items: SaleItem[], discountPercentage = 0, taxPercentage = 0) {
    if (!Number.isFinite(discountPercentage) || discountPercentage < 0 || discountPercentage > 100)
        throw new Error('Discount must be between 0 and 100%.');
    if (!Number.isFinite(taxPercentage) || taxPercentage < 0 || taxPercentage > 100)
        throw new Error('Tax must be between 0 and 100%.');
    const netSubtotal = money(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
    const subtotal = money(items.reduce((sum, item) => sum + Math.max(item.originalPrice ?? item.price, item.price) * item.quantity, 0));
    const globalDiscount = money(netSubtotal * discountPercentage / 100);
    const discount = money(subtotal - netSubtotal + globalDiscount);
    const tax = money((netSubtotal - globalDiscount) * taxPercentage / 100);
    const total = money(subtotal - discount + tax);
    if (![subtotal, discount, tax, total].every(Number.isFinite)) throw new Error('Sale amounts are too large.');
    return { subtotal, discount, tax, total };
}

export const outstandingAmount = (sale: Pick<Sale, 'total' | 'amountPaid'>) => money(Math.max(0, sale.total - sale.amountPaid));
export const getSaleType = (sale: Pick<Sale, 'total' | 'amountPaid'>): SaleType =>
    outstandingAmount(sale) === 0 ? 'Cash sale' : sale.amountPaid > 0 ? 'Partial sale' : 'Debt';

export function validatePayment(total: number, paid: number, method: string, saleType: SaleType = 'Cash sale') {
    if (!Number.isFinite(paid) || paid < 0 || !Number.isFinite(total) || total < 0)
        throw new Error('Enter a valid payment amount.');
    if (!['Cash', 'Mobile Money', 'Bank'].includes(method)) throw new Error('Choose a supported payment method.');
    if (saleType === 'Debt') {
        if (paid !== 0 || total <= 0) throw new Error('Debt sales must have a positive total and no payment.');
        return;
    }
    if (saleType === 'Partial sale') {
        if (money(paid) <= 0 || money(paid) >= total) throw new Error('A partial payment must be greater than zero and less than the total.');
        return;
    }
    if (saleType !== 'Cash sale') throw new Error('Choose a valid sale type.');
    if (money(paid) < total) throw new Error('Payment is less than the amount due.');
    if (method !== 'Cash' && money(paid) !== total) throw new Error('Bank and mobile money payments must equal the amount due.');
}

export function stockChanges(previous: SaleItem[], next: SaleItem[]) {
    const changes = new Map<string, number>();
    for (const item of previous) changes.set(item.productId, (changes.get(item.productId) || 0) + item.quantity);
    for (const item of next) changes.set(item.productId, (changes.get(item.productId) || 0) - item.quantity);
    return changes;
}

// Only actual receipts count as money received; cash change is excluded.
export const receivedAmount = (sale: Pick<Sale, 'total' | 'amountPaid'>) =>
    money(Math.min(Math.max(0, Number(sale.total) || 0), Math.max(0, Number(sale.amountPaid) || 0)));

export function saleReceipts(sale: Sale) {
    const paid = receivedAmount(sale);
    const payments = (sale.payments || []).filter(p => Number.isFinite(p.amount) && p.amount > 0);
    const laterTotal = money(payments.reduce((sum, p) => sum + p.amount, 0));
    const initial = money(Math.max(0, paid - laterTotal));
    const receipts = initial > 0 ? [{ amount: initial, timestamp: sale.timestamp, method: sale.paymentMethod, reference: sale.paymentReference || '', user: sale.cashierName }] : [];
    let remaining = money(paid - initial);
    for (const payment of payments) {
        const amount = money(Math.min(remaining, payment.amount));
        if (amount > 0) receipts.push({ amount, timestamp: payment.timestamp, method: payment.method as Sale['paymentMethod'], reference: payment.reference || '', user: payment.user });
        remaining = money(remaining - amount);
    }
    return receipts;
}

// Allocate invoice-level discounts across items; tax is not business profit.
export function itemNetValue(sale: Pick<Sale, 'items' | 'total' | 'tax'>, item: SaleItem) {
    const subtotal = sale.items.reduce((sum, entry) => sum + entry.total, 0);
    return subtotal > 0 ? item.total / subtotal * (sale.total - (sale.tax || 0)) : 0;
}
