import type { Product, SaleItem } from '../types';
import { itemImeis } from './imei';
import { normalizeScannedSaleCode, scannedImei } from './imeiScanner';

// A scan only changes the draft cart. Checkout still verifies customer, payments and fresh inventory.
export function addScannedSaleItem(products: Product[], cart: SaleItem[], raw: string, priceFor: (product: Product) => number, allowNegativeStock = false) {
    const code = normalizeScannedSaleCode(raw);
    const serialMatches = products.filter(product => product.type === 'Phone' && product.imeis?.includes(code));
    const matches = serialMatches;
    if (!matches.length) throw new Error('No available phone matches this IMEI. Refresh stock or record this phone in inventory first.');
    if (matches.length !== 1) throw new Error('This IMEI belongs to multiple products. Correct the inventory registration.');
    const product = matches[0];
    if (!product.id) throw new Error('This product has no saved inventory ID.');
    const isPhone = product.type === 'Phone', isSerial = true;
    if (isSerial) {
        scannedImei(code);
        if (cart.some(item => itemImeis(item).includes(code))) throw new Error('This phone IMEI is already in the current order.');
    }
    const existing = cart.find(item => item.productId === product.id);
    const imeis = existing ? itemImeis(existing) : [];
    if (isSerial) imeis.push(code);
    // Fill an already requested phone's missing IMEI before increasing its quantity.
    const quantity = isSerial ? Math.max(existing?.quantity || 0, imeis.length) : (existing?.quantity || 0) + 1;
    if ((!allowNegativeStock || isPhone) && quantity > product.stockQuantity) throw new Error(`Only ${product.stockQuantity} units of ${product.name} are available.`);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(product.stockQuantity)) throw new Error('Correct the product stock and order quantity before scanning.');
    const price = existing?.price ?? priceFor(product);
    if (!Number.isFinite(price) || price < 0) throw new Error('Correct this product price before selling it.');
    const item: SaleItem = { ...(existing || {}), productId: product.id, name: product.name, quantity, price, originalPrice: existing?.originalPrice ?? price, total: quantity * price,
        ...(isPhone ? { imeis } : {}) };
    return { cart: existing ? cart.map(entry => entry.productId === product.id ? item : entry) : [...cart, item],
        label: `${product.name}${isSerial ? ` / IMEI ${code}` : ` / Qty ${quantity}`}` };
}
