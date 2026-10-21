/** Keyboard viewport updates change CSS, not React state or the entire checkout tree. */
export function watchMobileViewport(win: Window = window, root: HTMLElement = document.documentElement) {
    const viewport = win.visualViewport;
    let frame: number | null = null;
    let height = '', top = '';
    const update = () => {
        frame = null;
        if (viewport && viewport.scale !== 1) return;
        const pixels = Math.round(viewport?.height || win.innerHeight);
        if (!Number.isFinite(pixels) || pixels <= 0) return;
        const nextHeight = `${pixels}px`, nextTop = `${Math.max(0, Math.round(viewport?.offsetTop || 0))}px`;
        if (nextHeight !== height) { root.style.setProperty('--app-viewport-height', nextHeight); height = nextHeight; }
        if (nextTop !== top) { root.style.setProperty('--app-viewport-top', nextTop); top = nextTop; }
    };
    const schedule = () => { if (frame === null) frame = win.requestAnimationFrame(update); };
    update();
    win.addEventListener('resize', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    return () => {
        if (frame !== null) win.cancelAnimationFrame(frame);
        win.removeEventListener('resize', schedule);
        viewport?.removeEventListener('resize', schedule);
        viewport?.removeEventListener('scroll', schedule);
        root.style.removeProperty('--app-viewport-height');
        root.style.removeProperty('--app-viewport-top');
    };
}
