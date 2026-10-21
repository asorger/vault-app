// src/components/ui/Toast.tsx — Floating notification toast system.

import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'error' | 'success' | 'info';
  title?: string;
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const icons = {
    error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />,
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />,
    info: <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />,
  }[toast.type];

  const borderColors = {
    error: 'border-rose-500/30 bg-[#161214]',
    success: 'border-emerald-500/30 bg-[#101614]',
    info: 'border-indigo-500/30 bg-[#12131a]',
  }[toast.type];

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl shadow-black/60 text-left transition-all transform animate-in slide-in-from-top-2 duration-200 ${borderColors}`}
    >
      {icons}
      <div className="flex-1 text-xs">
        {toast.title && <h5 className="font-semibold text-neutral-100 mb-0.5">{toast.title}</h5>}
        <p className="text-neutral-300 leading-relaxed break-words">{toast.message}</p>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1 rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-white/5 transition-colors cursor-pointer"
        aria-label="Close notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

