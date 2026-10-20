import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { CircleAlert, CircleCheck, ICON_SIZE, Info, TriangleAlert, X } from './icon';

type ToastTone = 'success' | 'error' | 'info' | 'warning';

/** One follow-up the toast offers, e.g. "Use this group instead". */
type ToastAction = { label: string; onClick: () => void };

type ToastData = {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
  action?: ToastAction;
};

type ToastInput = {
  tone?: ToastTone;
  title: string;
  message?: string;
  /**
   * Auto-dismiss delay in ms (0 to disable). Default 4500 — or 0 when the toast
   * has an action, so the action never times out from under a keyboard or
   * screen-reader user.
   */
  duration?: number;
  action?: ToastAction;
};

type ToastApi = {
  toast: (input: ToastInput) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  /** It happened, but not completely — stays a little longer than a success. */
  warning: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE_ICON = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
  warning: TriangleAlert,
} as const;

const WARNING_DURATION = 8000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    ({ tone = 'info', title, message, duration, action }: ToastInput) => {
      const id = (idRef.current += 1);
      setToasts((prev) => [...prev, { id, tone, title, message, action }]);
      const ms = duration ?? (action ? 0 : 4500);
      if (ms > 0) {
        window.setTimeout(() => remove(id), ms);
      }
    },
    [remove],
  );

  const api = useRef<ToastApi>({
    toast,
    success: (title, message) => toast({ tone: 'success', title, message }),
    error: (title, message) => toast({ tone: 'error', title, message }),
    warning: (title, message) => toast({ tone: 'warning', title, message, duration: WARNING_DURATION }),
  });
  // Keep the stable api object pointing at the latest toast closure.
  api.current.toast = toast;
  api.current.success = (title, message) => toast({ tone: 'success', title, message });
  api.current.error = (title, message) => toast({ tone: 'error', title, message });
  api.current.warning = (title, message) =>
    toast({ tone: 'warning', title, message, duration: WARNING_DURATION });

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
                  {item.action && (
                    <button
                      type="button"
                      className="toast-action"
                      onClick={() => {
                        item.action?.onClick();
                        remove(item.id);
                      }}
                    >
                      {item.action.label}
                    </button>
                  )}
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
