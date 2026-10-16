import type { Customer, Sale } from '../types';

// Older customer records predate account statuses; only explicit restrictions block sales.
export const customerStatus = (status?: string | null): Customer['status'] =>
    (status?.trim() || 'Active') as Customer['status'];

export const normalizeCustomerPhone = (phone = '') => {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('00')) return digits.slice(2);
    return /^0\d{9}$/.test(digits) ? `256${digits.slice(1)}` : digits;
};

// Prefer a non-empty phone. Legacy name-only sales must have an unambiguous owner.
export const getCustomerSales = (sales: Sale[], customer: Customer, customers: Customer[]) => {
    const phone = normalizeCustomerPhone(customer.phone);
    const name = (customer.name || '').trim().toLowerCase();
    const uniquePhone = !!phone && customers.filter(c => normalizeCustomerPhone(c.phone) === phone).length === 1;
    const uniqueName = !!name && customers.filter(c => (c.name || '').trim().toLowerCase() === name).length === 1;
    return sales.filter(sale => {
        if (sale.customerId) return sale.customerId === customer.id;
        const salePhone = normalizeCustomerPhone(sale.customerPhone);
        if (phone && salePhone) {
            return phone === salePhone && uniquePhone;
        }
        const saleName = (sale.customerName || '').trim().toLowerCase();
        return uniqueName && name === saleName;
    });
};

export const escapeCustomerCSVCell = (value: unknown) => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
};


export function validateCustomerContact(name: string, phone: string, email = '') {
    if (!name.trim()) throw new Error('Enter the customer name.');
    if (/[a-z]/i.test(phone) || !/^[1-9]\d{6,14}$/.test(normalizeCustomerPhone(phone))) throw new Error('Enter a valid phone number with a country code for international numbers.');
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter a valid email address.');
}
export function customerAccountSummary(sales: Sale[]) {
    const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    return { salesValue: round(sales.reduce((sum, sale) => sum + sale.total, 0)),
        received: round(sales.reduce((sum, sale) => sum + Math.min(Math.max(0, sale.amountPaid || 0), Math.max(0, sale.total)), 0)),
        outstanding: round(sales.reduce((sum, sale) => sum + Math.max(0, sale.total - (sale.amountPaid || 0)), 0)),
        orders: sales.length, lastPurchase: sales.length ? Math.max(...sales.map(sale => sale.timestamp)) : null };
}

export function findCustomerMatches(customers: Customer[], draft: Partial<Customer>, excludeId?: string | null) {
    const name = (draft.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const email = (draft.email || '').trim().toLowerCase();
    const phone = normalizeCustomerPhone(draft.phone);
    return customers.filter(c => !excludeId || c.id !== excludeId).map(customer => ({
        customer,
        phoneMatch: !!phone && normalizeCustomerPhone(customer.phone) === phone,
        nameMatch: !!name && (customer.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === name,
        emailMatch: !!email && (customer.email || '').trim().toLowerCase() === email,
    })).filter(match => match.phoneMatch || match.nameMatch || match.emailMatch);
}
