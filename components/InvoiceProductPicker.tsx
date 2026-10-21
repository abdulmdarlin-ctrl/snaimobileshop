import React, { memo, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import type { Product, SaleItem } from '../types';
import { indexProducts, searchProducts } from '../utils/productSearch';

export default memo(function InvoiceProductPicker({ products, items, priceFor, onAdd, disabled = false }: {
    products: Product[]; items: SaleItem[]; priceFor: (product: Product) => number; onAdd: (product: Product) => void; disabled?: boolean;
}) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [announcement, setAnnouncement] = useState('');
    const deferred = useDeferredValue(query);
    const pending = deferred !== query;
    const index = useMemo(() => indexProducts(products), [products]);
    const matches = useMemo(() => searchProducts(index, deferred), [index, deferred]);
    const input = useRef<HTMLInputElement>(null), root = useRef<HTMLDivElement>(null);
    const id = useId();
    useEffect(() => {
        if (!open) return;
        const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open]);
    const add = (product?: Product) => {
        if (disabled || pending || !product?.id) return;
        onAdd(product);
        setAnnouncement(`${product.name} added to invoice.`);
        setQuery(''); setOpen(false); setActive(-1); input.current?.blur();
    };
    return <div className="invoice-product-picker" ref={root} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
        <label htmlFor={`${id}-input`}>Add product</label>
        <div className="invoice-product-search">
            <Search size={18} aria-hidden="true" />
            <input id={`${id}-input`} ref={input} type="search" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && !pending && matches[active] ? `${id}-${active}` : undefined} placeholder="Search product name or brand" autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" disabled={disabled} value={query}
                onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); setAnnouncement(''); }}
                onKeyDown={event => {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); if (!pending && matches.length) setActive(value => event.key === 'ArrowDown' ? Math.min(matches.length - 1, value + 1) : value <= 0 ? matches.length - 1 : value - 1); }
                    // Enter searches/adds a product; it must never submit the invoice form.
                    if (event.key === 'Enter') { event.preventDefault(); if (open) add(matches[active >= 0 ? active : 0]); else setOpen(true); }
                }} />
            {query && <button type="button" aria-label="Clear product search" disabled={disabled} onClick={() => { setQuery(''); setActive(-1); setOpen(true); input.current?.focus(); }}><X size={18} /></button>}
        </div>
        {open && <div id={`${id}-list`} className="invoice-product-results" role="listbox" aria-label="Products to add" aria-busy={pending}>
            {pending ? <p role="status">Searching products...</p> : matches.length ? <>
                {matches.map((product, position) => {
                    const existing = items.find(item => item.productId === product.id);
                    return <button key={product.id} id={`${id}-${position}`} type="button" role="option" aria-selected={position === active} tabIndex={-1} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => add(product)}>
                        <span><strong>{product.name}</strong><small>{product.brand ? `${product.brand} / ` : ''}Stock: {product.stockQuantity.toLocaleString()}{existing ? ` / On invoice: ${existing.quantity}` : ''}</small></span>
                        <span className="invoice-product-result-price">UGX {(existing?.price ?? priceFor(product)).toLocaleString()}<Plus size={17} aria-hidden="true" /></span>
                    </button>;
                })}
                {matches.length === 8 && <p>Showing up to 8 products. Type more to narrow the results.</p>}
            </> : <p role="status">No products match this search. Try another name or brand.</p>}
        </div>}
        <p className="invoice-product-announcement" role="status" aria-live="polite">{announcement}</p>
    </div>;
});
