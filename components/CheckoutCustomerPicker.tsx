import React, { memo, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, UserRound, X } from 'lucide-react';
import type { Customer } from '../types';
import { indexCustomers, searchCustomers } from '../utils/customerSearch';
import { registeredCustomerIssue } from '../utils/customers';

interface Props {
    customers: Customer[];
    selectedName: string;
    selectedPhone: string;
    onSelect: (customer: Customer) => void;
    onClear: () => void;
    onCreate: () => void;
}

// Keep keystrokes away from the inventory grid and the other POS dialogs.
export default memo(function CheckoutCustomerPicker({ customers, selectedName, selectedPhone, onSelect, onClear, onCreate }: Props) {
    const [query, setQuery] = useState(selectedName);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const deferred = useDeferredValue(query);
    const pending = deferred !== query;
    const index = useMemo(() => indexCustomers(customers), [customers]);
    const matches = useMemo(() => searchCustomers(index, deferred), [index, deferred]);
    const root = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const listId = useId();
    const visible = open && !!query.trim();
    useEffect(() => { if (selectedName) { setQuery(selectedName); setOpen(false); } }, [selectedName, selectedPhone]);
    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open]);
    const select = (customer?: Customer) => {
        if (registeredCustomerIssue(customer)) return;
        setQuery(customer.name); setOpen(false); setActive(-1);
        input.current?.blur();
        onSelect(customer);
    };
    return <div className="checkout-customer-picker" ref={root} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
        <label className="checkout-customer-label" htmlFor={`${listId}-input`}>Find a customer</label>
        <div className="checkout-customer-input">
            <Search size={18} aria-hidden="true" />
            <input ref={input} id={`${listId}-input`} role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={listId} aria-activedescendant={visible && !pending && active >= 0 && matches[active] ? `${listId}-${active}` : undefined} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" placeholder="Search name or phone" value={query}
                onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); if (selectedName) onClear(); }}
                onKeyDown={event => {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); setActive(-1); return; }
                    const eligible = matches.map((customer, position) => !registeredCustomerIssue(customer) ? position : -1).filter(position => position >= 0);
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); if (!pending && eligible.length) { const current = eligible.indexOf(active); setActive(eligible[event.key === 'ArrowDown' ? Math.min(eligible.length - 1, current + 1) : current <= 0 ? eligible.length - 1 : current - 1]); } }
                    if (event.key === 'Enter') { event.preventDefault(); if (visible && !pending && eligible.length) select(matches[eligible.includes(active) ? active : eligible[0]]); }
                }} />
            {query && <button type="button" aria-label="Clear customer search" onClick={() => { setQuery(''); setActive(-1); setOpen(true); onClear(); input.current?.focus(); }}><X size={17} /></button>}
        </div>
        {visible && <div className="checkout-customer-results" id={listId} role="listbox" aria-label="Matching customers" aria-busy={pending}>
            {pending ? <p role="status">Searching customers...</p> : matches.length ? matches.map((customer, position) => <button type="button" role="option" aria-selected={position === active} id={`${listId}-${position}`} key={customer.id || `${customer.phone}-${position}`} disabled={!!registeredCustomerIssue(customer)} onMouseDown={event => event.preventDefault()} onClick={() => select(customer)}>
                <strong>{customer.name}</strong><span>{customer.phone || 'Phone not recorded'}{customer.address ? ` / ${customer.address}` : ''}</span>{registeredCustomerIssue(customer) && <small>{registeredCustomerIssue(customer)}</small>}
            </button>) : <div className="checkout-customer-empty"><p role="status">No matching customer found.</p><button type="button" onClick={() => { input.current?.blur(); setOpen(false); onCreate(); }}>Create a customer</button></div>}
        </div>}
        {selectedName && <div className="checkout-customer-selected"><UserRound size={18} aria-hidden="true" /><div><strong>{selectedName}</strong><span>{selectedPhone || 'Phone not recorded'}</span></div><button type="button" aria-label="Remove selected customer" onClick={() => { setQuery(''); setOpen(false); setActive(-1); onClear(); }}><X size={18} /></button></div>}
    </div>;
});
