'use client'
// file: frontend/components/toast.tsx
import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

export type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, default 5000
};

type ToastContextValue = {
  addToast: (t: Omit<Toast, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

// ── Single Toast Item ────────────────────────────────────────────────────────
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const duration = toast.duration ?? 5000;
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const elapsedRef = useRef(0);

  // Slide in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const startTimer = useCallback(() => {
    startRef.current = performance.now();
    const tick = () => {
      if (pausedRef.current) return;
      const now = performance.now();
      const elapsed = elapsedRef.current + (now - (startRef.current ?? now));
      const remaining = Math.max(0, 1 - elapsed / duration);
      setProgress(remaining * 100);
      if (elapsed >= duration) {
        dismiss();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [duration]);

  useEffect(() => {
    startTimer();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startTimer]);

  function pause() {
    pausedRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    elapsedRef.current += performance.now() - (startRef.current ?? performance.now());
  }

  function resume() {
    pausedRef.current = false;
    startRef.current = performance.now();
    startTimer();
  }

  function dismiss() {
    setVisible(false);
    setTimeout(() => onRemove(toast.id), 350);
  }

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle size={18} className="text-emerald-500 shrink-0 mt-0.5" />,
    error:   <XCircle    size={18} className="text-red-500 shrink-0 mt-0.5" />,
    info:    <Info       size={18} className="text-indigo-500 shrink-0 mt-0.5" />,
  };

  const barColors: Record<ToastType, string> = {
    success: 'bg-emerald-500',
    error:   'bg-red-500',
    info:    'bg-indigo-500',
  };

  return (
    <div
      onMouseEnter={pause}
      onMouseLeave={resume}
      style={{
        transform: visible ? 'translateX(0)' : 'translateX(110%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease',
      }}
      className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-lg border border-zinc-100 dark:border-zinc-800 overflow-hidden pointer-events-auto"
    >
      {/* Content */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        {icons[toast.type]}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">{toast.title}</p>
          {toast.message && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{toast.message}</p>
          )}
        </div>
        <button
          onClick={dismiss}
          className="text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 transition-colors shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-zinc-100 dark:bg-zinc-800">
        <div
          className={`h-full ${barColors[toast.type]} transition-none`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ── Provider ─────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...t, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      {/* Toast container — bottom-right */}
      <div className="fixed bottom-5 right-4 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}