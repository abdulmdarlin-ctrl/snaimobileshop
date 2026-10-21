import type { Product } from '../types';

export function indexProducts(products: Product[]) {
    return products.filter(product => !!product.id).map(product => ({ product,
        text: [product.name, product.brand, product.category, product.type].filter(Boolean).join('\n').toLowerCase() }));
}

export function searchProducts(index: ReturnType<typeof indexProducts>, query: string, limit = 8): Product[] {
    if (limit < 1) return [];
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches: Product[] = [];
    for (const row of index) {
        if (terms.every(term => row.text.includes(term))) matches.push(row.product);
        if (matches.length >= limit) break;
    }
    return matches;
}
