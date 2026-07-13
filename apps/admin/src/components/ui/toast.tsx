import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { CircleAlert, CircleCheck, ICON_SIZE, Info, X } from './icon';

type ToastTone = 'success' | 'error' | 'info';

type ToastData = {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
};

type ToastInput = {
  tone?: ToastTone;
  title: string;
  message?: string;
  /** Auto-dismiss delay in ms (0 to disable). Default 4500. */
  duration?: number;
};

type ToastApi = {
  toast: (input: ToastInput) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE_ICON = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    ({ tone = 'info', title, message, duration = 4500 }: ToastInput) => {
      const id = (idRef.current += 1);
      setToasts((prev) => [...prev, { id, tone, title, message }]);
      if (duration > 0) {
        window.setTimeout(() => remove(id), duration);
      }
    },
    [remove],
  );

  const api = useRef<ToastApi>({
    toast,
    success: (title, message) => toast({ tone: 'success', title, message }),
    error: (title, message) => toast({ tone: 'error', title, message }),
  });
  // Keep the stable api object pointing at the latest toast closure.
  api.current.toast = toast;
  api.current.success = (title, message) => toast({ tone: 'success', title, message });
  api.current.error = (title, message) => toast({ tone: 'error', title, message });

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      {createPortal(
        <div className="toast-viewport">
          {toasts.map((item) => {
            const Icon = TONE_ICON[item.tone];
            return (
              <div className={`toast toast--${item.tone}`} key={item.id} role="status">
                <span className="toast-icon">
                  <Icon size={ICON_SIZE.inline} />
                </span>
                <div className="toast-body">
                  <p className="toast-title">{item.title}</p>
                  {item.message && <p className="toast-message">{item.message}</p>}
                </div>
                <button
                  type="button"
                  className="toast-close"
                  aria-label="Dismiss"
                  onClick={() => remove(item.id)}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
