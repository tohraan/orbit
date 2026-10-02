"use client";

/* §70: short-lived confirmation. Deliberately cannot carry anything the
 * student must still be able to read in five seconds — no errors, no
 * instructions, no undo that is the only way to recover. */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import u from "../ui/ui.module.css";
import { Icon } from "../ui/Icon";

type Toast = { id: number; message: string };
const ToastContext = createContext<(message: string) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const push = useCallback((message: string) => {
    const id = next.current++;
    /* At most two on screen. A stack of six is a log, and §70 says a toast is
     * not where information lives. */
    setToasts((cur) => [...cur.slice(-1), { id, message: message.slice(0, 90) }]);
    window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 2600);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live, not role=alert: a save confirmation should not interrupt
          whatever a screen reader is in the middle of saying. */}
      <div className={u.toastDock} aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div className={u.toast} key={t.id}>
            <Icon name="check" size={16} strokeWidth={2} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
