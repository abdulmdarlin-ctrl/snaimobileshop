export interface DialogOptions {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: 'default' | 'danger';
    details?: { label: string; value: string }[];
    inputLabel?: string;
    multiline?: boolean;
    requiredText?: string;
}
export interface DialogRequest extends DialogOptions { id: number; kind: 'confirm' | 'notice' | 'input'; }
let sequence = 0;
let queue: { request: DialogRequest; resolve: (value: boolean | string | null) => void }[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
export const subscribeDialogs = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const currentDialog = () => queue[0]?.request ?? null;
export function resolveDialog(id: number, value: boolean | string | null) {
    if (queue[0]?.request.id !== id) return;
    queue.shift()!.resolve(value);
    emit();
}
export function cancelDialogs() {
    const pending = queue;
    queue = [];
    pending.forEach(entry => entry.resolve(entry.request.kind === 'input' ? null : false));
    emit();
}
function request(kind: DialogRequest['kind'], options: DialogOptions | string) {
    const normalized = typeof options === 'string' ? { message: options } : options;
    // Suppress a second invocation of the same action before the first is answered.
    if (queue.some(entry => entry.request.kind === kind && entry.request.message === normalized.message)) return Promise.resolve(kind === 'input' ? null : false);
    return new Promise<boolean | string | null>(resolve => {
        queue.push({ request: { ...normalized, kind, id: ++sequence }, resolve });
        emit();
    });
}
export async function confirmAction(options: DialogOptions | string): Promise<boolean> { return await request('confirm', options) === true; }
export async function requestText(options: DialogOptions): Promise<string | null> {
    const value = await request('input', options);
    return typeof value === 'string' ? value : null;
}
export async function notifyDialog(message: string, title = 'Unable to complete action') { await request('notice', { title, message, confirmLabel: 'Got it' }); }
