export const parseImeis = (value: string) => value.split(/[\s,;]+/).map(value => value.trim()).filter(Boolean);

export function validateImeis(imeis: string[], quantity: number) {
    if (!Number.isSafeInteger(quantity) || quantity < 0 || imeis.length !== quantity)
        throw new Error('Enter one primary IMEI for each phone in stock or in the sale.');
    if (imeis.some(imei => !/^\d{15}$/.test(imei) || /^(\d)\1{14}$/.test(imei)))
        throw new Error('Each IMEI must contain 15 digits. Repeated placeholder digits are not allowed.');
    if (new Set(imeis).size !== imeis.length) throw new Error('Each phone must have a different IMEI.');
}

export const itemImeis = (item: { imeis?: string[]; sn?: string }) => parseImeis(item.imeis?.join('\n') || item.sn || '');
