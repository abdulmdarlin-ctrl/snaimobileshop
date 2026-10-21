import type { Customer } from '../types';
import { normalizeCustomerPhone } from './customers';

export function indexCustomers(customers: Customer[]) {
    return customers.map(customer => {
        const phone = normalizeCustomerPhone(customer.phone);
        const local = phone.startsWith('256') && phone.length === 12 ? `0${phone.slice(3)}` : phone;
        return { customer, text: [customer.name, customer.phone, phone, local, customer.email, customer.address].filter(Boolean).join('\n').toLowerCase() };
    });
}

export function searchCustomers(index: ReturnType<typeof indexCustomers>, query: string, limit = 5): Customer[] {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length || limit < 1) return [];
    const matches: Customer[] = [];
    for (const row of index) {
        if (terms.every(term => row.text.includes(term))) matches.push(row.customer);
        if (matches.length >= limit) break;
    }
    return matches;
}
