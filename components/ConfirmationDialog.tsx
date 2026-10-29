import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { cancelDialogs, currentDialog, DialogRequest, resolveDialog, subscribeDialogs } from '../utils/dialog';
import { activateDialog } from '../utils/dialogSurface';

function DialogContent({ request }: { request: DialogRequest }) {
    const panel = useRef<HTMLDivElement>(null);
    const cancel = useRef<HTMLButtonElement>(null);
    const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
    const [value, setValue] = useState('');
    const dismiss = () => resolveDialog(request.id, request.kind === 'input' ? null : false);
    useLayoutEffect(() => {
        if (panel.current) return activateDialog(panel.current, dismiss, () => request.kind === 'input' ? input.current : cancel.current);
    }, [request.id]);
    const danger = request.tone === 'danger';
    const valid = request.kind !== 'input' || (request.requiredText ? value === request.requiredText : !!value.trim());
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (valid) resolveDialog(request.id, request.kind === 'input' ? value.trim() : true);
    };
    return <div className="confirmation-layer">
        <div ref={panel} role={request.kind === 'input' ? 'dialog' : 'alertdialog'} aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" className="dialog-surface confirmation-panel">
            <form onSubmit={submit}>
                <header className="confirmation-header">
                    <span className={`confirmation-icon ${danger ? 'is-danger' : ''}`}>
                        {danger ? <AlertTriangle size={22} strokeWidth={1.75} /> : request.kind === 'notice' ? <Info size={22} strokeWidth={1.75} /> : <Check size={22} strokeWidth={1.75} />}
                    </span>
                    <h2 id="confirmation-title">{request.title || 'Confirm changes'}</h2>
                    <button type="button" className="confirmation-close" aria-label="Close confirmation" onClick={dismiss}><X size={19} strokeWidth={1.75} /></button>
                </header>
                <div className="confirmation-body">
                    <p id="confirmation-description">{request.message}</p>
                    {!!request.details?.length && <dl className="confirmation-details">{request.details.map(detail => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>}
                    {request.kind === 'input' && <label className="confirmation-input-label">{request.inputLabel || 'Enter details'}
                        {request.multiline ? <textarea ref={input} value={value} onChange={event => setValue(event.target.value)} rows={7} autoComplete="off" /> : <input ref={input} value={value} onChange={event => setValue(event.target.value)} autoComplete="off" />}
                        {request.requiredText && <span>Type {request.requiredText} to continue.</span>}
                    </label>}
                </div>
                <footer className="confirmation-footer">
                    {request.kind !== 'notice' && <button ref={cancel} type="button" className="confirmation-cancel" onClick={dismiss}>{request.cancelLabel || 'Cancel'}</button>}
                    <button ref={request.kind === 'notice' ? cancel : undefined} type="submit" disabled={!valid} className={`confirmation-submit ${danger ? 'is-danger' : ''}`}>{request.confirmLabel || (request.kind === 'notice' ? 'Got it' : 'Confirm')}</button>
                </footer>
            </form>
        </div>
    </div>;
}
export default function ConfirmationDialog() {
    const request = useSyncExternalStore(subscribeDialogs, currentDialog, () => null);
    useEffect(() => () => cancelDialogs(), []);
    return request ? createPortal(<DialogContent key={request.id} request={request} />, document.body) : null;
}
