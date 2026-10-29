import type { Sale } from '../types';

const dateParts = (timestamp: number) => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Kampala', day: '2-digit', month: '2-digit', year: 'numeric'
}).formatToParts(new Date(timestamp));

/** Date-only terms stay in shop time, independent of the attendant's device timezone. */
export function saleDateInput(timestamp: number): string {
    if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) return '';
    const parts = dateParts(timestamp);
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function validSaleDueDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function formatSaleDate(value?: string | number): string {
    const date = typeof value === 'number' ? saleDateInput(value) : value;
    return date && validSaleDueDate(date) ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}` : 'Not set';
}
export function validateSaleDetails(sale: Pick<Sale, 'timestamp'>, dueDate: string, notes: string) {
    if (typeof dueDate !== 'string' || (dueDate && !validSaleDueDate(dueDate))) throw new Error('Enter a valid payment due date.');
    if (dueDate && dueDate < saleDateInput(sale.timestamp)) throw new Error('The payment due date cannot be before the sale date.');
    if (typeof notes !== 'string' || notes.trim().length > 2000) throw new Error('Sale notes must be no longer than 2,000 characters.');
    return { dueDate, notes: notes.trim() };
}
