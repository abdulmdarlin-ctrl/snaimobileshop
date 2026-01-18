import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            // Fallback UI when an error occurs
            return (
                <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-3xl border border-slate-200 animate-in fade-in zoom-in duration-300">
                    <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-red-100">
                        <AlertTriangle size={40} />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">System Encountered an Error</h2>
                    <p className="text-sm text-slate-500 max-w-md mb-8 leading-relaxed">
                        The component failed to render. This might be due to a temporary glitch or data inconsistency.
                    </p>

                    <button
                        onClick={() => window.location.reload()}
                        className="flex items-center gap-2 px-8 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-900/20 active:scale-95"
                    >
                        <RefreshCw size={16} /> Reload System
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
