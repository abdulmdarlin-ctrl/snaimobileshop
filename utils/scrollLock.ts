const locks = new WeakMap<HTMLElement, { count: number; overflow: string }>();

/** Closing one dialog must not unlock another dialog underneath it. */
export function lockBodyScroll(body: HTMLElement = document.body) {
    let state = locks.get(body);
    if (!state) {
        state = { count: 0, overflow: body.style.overflow };
        locks.set(body, state);
        body.style.overflow = 'hidden';
    }
    state.count++;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        if (--state.count === 0) { body.style.overflow = state.overflow; locks.delete(body); }
    };
}
