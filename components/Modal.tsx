
import React, { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { activateDialog } from '../utils/dialogSurface';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    ariaLabel?: string;
    description?: React.ReactNode;
    footer?: React.ReactNode;
    busy?: boolean;
    children: React.ReactNode;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full';
    noPadding?: boolean;
    contentClassName?: string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, ariaLabel, description, footer, busy = false, children, maxWidth = 'md', noPadding = false, contentClassName = 'overflow-y-auto custom-scrollbar' }) => {
    const [mounted, setMounted] = useState(false);
    const close = useRef(onClose);
    close.current = () => { if (!busy) onClose(); };
    const panel = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        setMounted(true);
    }, []);

    useLayoutEffect(() => {
        if (mounted && isOpen && panel.current) return activateDialog(panel.current, () => close.current());
    }, [mounted, isOpen]);

    if (!mounted || !isOpen) return null;

    const maxWidthClasses = {
        'sm': 'max-w-sm',
        'md': 'max-w-md',
        'lg': 'max-w-lg',
        'xl': 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        '5xl': 'max-w-5xl',
        '6xl': 'max-w-6xl',
        '7xl': 'max-w-7xl',
        'full': 'max-w-full m-4',
    };

    return createPortal(
        <div className="app-modal-layer fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
            {/* Overlay Click to Close */}
            <div className="absolute inset-0" onClick={() => close.current()} aria-hidden="true" />

            {/* Modal Content */}
            <div ref={panel} role="dialog" aria-modal="true" aria-busy={busy || undefined} aria-label={ariaLabel || (!title ? 'Dialog' : undefined)} aria-labelledby={!ariaLabel && title ? titleId : undefined} aria-describedby={description ? descriptionId : undefined} className={`dialog-surface app-modal-panel relative w-full ${maxWidthClasses[maxWidth]} bg-white rounded-xl flex flex-col max-h-[90vh] border border-slate-200 overflow-hidden`}>
                {(title || description) && (
                    <div className="app-modal-heading flex items-center justify-between gap-3 p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
                        <div className="app-modal-title">
                        <div id={titleId}>
                        {typeof title === 'string' ? (
                            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                        ) : title}
                        </div>
                        {description && <p id={descriptionId} className="app-modal-description">{description}</p>}
                        </div>
                        <button
                            type="button"
                            disabled={busy}
                            aria-label="Close dialog"
                            onClick={() => close.current()}
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                        >
                            <X size={20} strokeWidth={1.75} />
                        </button>
                    </div>
                )}

                <div className={`app-modal-body min-h-0 ${contentClassName} ${noPadding ? '' : 'p-6'}`}>
                    {children}
                </div>
                {footer && <footer className="app-modal-footer">{footer}</footer>}
            </div>
        </div>,
        document.body
    );
};

export default Modal;
