export interface ReadOptions { fresh?: boolean; }

/** Short-lived display data only. Stock/payment transactions must always read Firestore. */
export function createDatabaseReadCache(now = () => Date.now()) {
    const entries = new Map<string, { value?: unknown; expires: number; pending?: Promise<unknown> }>();
    const copy = <T>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value));
    return {
        read: async <T>(key: string, load: () => Promise<T>, options: ReadOptions = {}, ttl = 30_000): Promise<T> => {
            let entry = entries.get(key);
            if (!options.fresh && entry && 'value' in entry && entry.expires > now()) return copy(entry.value as T);
            if (!entry) { entry = { expires: 0 }; entries.set(key, entry); }
            if (!entry.pending) {
                const current = entry;
                const pending = Promise.resolve().then(load).then(value => {
                    // A write or logout may invalidate a request while it is running.
                    if (entries.get(key) === current && current.pending === pending) { current.value = copy(value); current.expires = now() + ttl; }
                    return value;
                }).finally(() => { if (current.pending === pending) current.pending = undefined; });
                current.pending = pending;
            }
            return copy(await entry.pending as T);
        },
        seed: (key: string, value: unknown, ttl = 30_000) => { entries.set(key, { value: copy(value), expires: now() + ttl }); },
        invalidate: (prefix?: string) => { for (const key of entries.keys()) if (!prefix || key.startsWith(prefix)) entries.delete(key); }
    };
}
