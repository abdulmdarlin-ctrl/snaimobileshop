export function isDatabaseQuotaError(error: unknown): boolean {
    const value = error as { code?: string; message?: string; name?: string } | null;
    if (value?.name === 'QuotaExceededError') return false; // Browser storage is a separate limit.
    const code = String(value?.code || '').replace(/^firestore\//, '');
    const message = typeof error === 'string' ? error : value?.message || '';
    return code === 'resource-exhausted' || /quota (?:has been )?exceeded|resource[- ]exhausted|daily (?:read|write).*limit/i.test(message);
}

export function databaseErrorMessage(error: unknown, fallback: string): string {
    if (isDatabaseQuotaError(error)) return 'Cloud database quota reached. Ask an administrator to check Firebase usage and billing, or wait for the quota to reset.';
    return error instanceof Error ? error.message : fallback;
}
