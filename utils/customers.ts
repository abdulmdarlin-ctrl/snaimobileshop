import type { Customer, Sale } from '../types';

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
