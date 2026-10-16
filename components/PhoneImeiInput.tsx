import { confirmAction } from '../utils/dialog';
import React, { useState } from 'react';
import { parseImeis, validateImeis } from '../utils/imei';

interface Props {
    imeis: string[];
    quantity: number;
    onChange: (imeis: string[]) => void;
    onQuantityChange: (quantity: number) => void;
}

export default function PhoneImeiInput({ imeis, quantity, onChange, onQuantityChange }: Props) {
    const [mode, setMode] = useState<'individual' | 'bulk'>('individual');
    const [bulkText, setBulkText] = useState('');
    const count = imeis.filter(value => value.trim()).length;
    let error = '';
    try { validateImeis(imeis, quantity); } catch (e) { error = (e as Error).message; }
    const rows = Math.max(Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0, imeis.length);

    return <section className="space-y-3 border border-slate-200 rounded-lg p-4" aria-label="Phone serial numbers">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Phone serial numbers (IMEI)</h3>
            <div className="flex gap-2" aria-label="IMEI entry method">
                {(['individual', 'bulk'] as const).map(option => <button key={option} type="button" aria-pressed={mode === option}
                    className={`px-3 py-2 text-sm rounded border ${mode === option ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300'}`}
                    onClick={() => { if (option === 'bulk') setBulkText(imeis.join('\n')); setMode(option); }}>
                    {option === 'individual' ? 'Each phone' : 'Bulk serial numbers'}
                </button>)}
            </div>
        </div>
        <p className="text-xs text-slate-600">Enter one 15-digit primary IMEI per physical phone in current stock. Do not enter both SIM-slot IMEIs for the same phone.</p>
        {mode === 'individual' ? <>
            {rows === 0 && <p className="text-sm text-slate-500">Set Current Stock to show a field for each phone, or add a phone below.</p>}
            <div className="space-y-3 max-h-64 overflow-y-auto">
                {Array.from({ length: Math.min(rows, 100) }, (_, index) => {
                    const value = imeis[index] || '';
                    const duplicate = !!value && imeis.filter(imei => imei === value).length > 1;
                    return <label key={index} className="block text-xs font-medium text-slate-700">
                        Phone {index + 1} — IMEI
                        <input className="win-input mt-1 font-mono" type="text" inputMode="numeric" autoComplete="off" maxLength={15}
                            value={value} placeholder="15-digit IMEI" aria-invalid={duplicate || (!!value && !/^\d{15}$/.test(value))}
                            onChange={e => { const next = Array.from({ length: rows }, (_, i) => imeis[i] || ''); next[index] = e.target.value.trim(); onChange(next); }} />
                        {duplicate && <span className="text-red-600">This IMEI is entered more than once.</span>}
                    </label>;
                })}
            </div>
            {rows > 100 && <p className="text-sm text-amber-700">Showing the first 100 phones. Use Bulk serial numbers to enter or review the full list.</p>}
            <button type="button" className="text-sm underline text-slate-700" onClick={() => { onChange([...Array.from({ length: rows }, (_, i) => imeis[i] || ''), '']); onQuantityChange(rows + 1); }}>Add another phone</button>
        </> : <label className="block text-sm text-slate-700">
            Paste IMEIs from your list or spreadsheet
            <textarea className="win-input mt-2 h-40 font-mono" value={bulkText} placeholder="One IMEI per line, or separated by commas, spaces or semicolons"
                onChange={e => { setBulkText(e.target.value); onChange(parseImeis(e.target.value)); }} />
            <button type="button" className="mt-2 text-sm underline" onClick={() => onQuantityChange(count)}>Set Current Stock to {count} entered phones</button>
        </label>}
        <p className="text-sm text-slate-600" aria-live="polite">{count} IMEIs entered / {quantity} phones in stock</p>
        {error && <p className="text-sm text-red-600" role="status">{error}</p>}
        {imeis.length > quantity && mode === 'individual' && <button type="button" className="text-sm underline text-red-700" onClick={async () => {
            if (Number.isSafeInteger(quantity) && quantity >= 0 && await confirmAction({ title: 'Remove extra IMEIs?', message: `Remove the last ${imeis.length - quantity} entries to match Current Stock? The change is saved when you save the product.`, confirmLabel: 'Remove entries', tone: 'danger' })) onChange(imeis.slice(0, quantity));
        }}>Remove extra entries to match stock</button>}
    </section>;
}
