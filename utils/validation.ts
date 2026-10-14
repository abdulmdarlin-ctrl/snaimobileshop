const requiredFields: Record<string, string[]> = {
    products: ['name', 'sku'], customers: ['name', 'phone'], suppliers: ['name'],
    expenses: ['description', 'category'], expenseCategories: ['name'],
    repairs: ['customerName', 'customerPhone', 'deviceModel', 'issue'],
    agents: ['name', 'phone'], loans: ['customerName', 'customerPhone', 'deviceModel', 'imei'],
    users: ['username'], sales: ['customerId', 'customerName', 'customerPhone']
};
const nonnegative = new Set(['costPrice', 'selling_price', 'minSellingPrice', 'middleManPrice', 'price', 'amount', 'amountPaid', 'estimatedCost', 'depositPaid', 'deposit', 'totalLoanAmount', 'dailyInstallment', 'remittedAmount', 'reorderLevel']);

/** Validate before JSON serialization, which would otherwise turn NaN/Infinity into null. */
export function validateRecord(collection: string, data: Record<string, any>, partial = false) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid record.');
    for (const field of requiredFields[collection] || []) {
        if ((!partial || field in data) && (typeof data[field] !== 'string' || !data[field].trim()))
            throw new Error(`${field.replace(/([A-Z])/g, ' $1')} is required.`);
    }
    const inspect = (value: any, key = '') => {
        if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`${key} must be a valid number.`);
        if (nonnegative.has(key) && value != null && (typeof value !== 'number' || value < 0)) throw new Error(`${key} must be a non-negative number.`);
        if (key === 'quantity' && (!Number.isSafeInteger(value) || value <= 0)) throw new Error('Quantity must be a positive whole number.');
        if (key === 'stockQuantity' && !Number.isSafeInteger(value)) throw new Error('Stock quantity must be a whole number.');
        if (key === 'email' && value && (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))) throw new Error('Enter a valid email address.');
        if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, child]) => inspect(child, childKey));
    };
    inspect(data);
    for (const field of ['timestamp', 'date', 'startDate']) {
        if (field in data && (typeof data[field] !== 'number' || !Number.isFinite(data[field]) || !Number.isFinite(new Date(data[field]).getTime()))) throw new Error('Enter a valid date.');
    }
    if (collection === 'expenses' && 'amount' in data && data.amount <= 0) throw new Error('Expense amount must be greater than zero.');
    if ('taxPercentage' in data && (data.taxPercentage < 0 || data.taxPercentage > 100)) throw new Error('Tax must be between 0 and 100%.');
}
