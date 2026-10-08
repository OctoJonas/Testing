"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ToastContext, type Toast, type ToastAction, type ToastType } from "./toast-context";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", duration = 5_000, action?: ToastAction) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      setToasts((prev) => [...prev, { id, message, type, duration, action }]);
      if (duration > 0) setTimeout(() => removeToast(id), duration);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}
