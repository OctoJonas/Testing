"use client";

import { useToast } from "@/contexts/useToast";
import type { ToastType } from "@/contexts/toast-context";

const typeStyles: Record<ToastType, string> = {
  success: "bg-green-500 border-green-600",
  error: "bg-red-500 border-red-600",
  warning: "bg-yellow-500 border-yellow-600",
  info: "bg-blue-500 border-blue-600",
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={`text-white border ${typeStyles[t.type]} rounded-lg shadow-lg px-4 py-3 max-w-sm flex items-start gap-2`}
        >
          <span className="flex-1 text-sm">
            {t.message}
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  removeToast(t.id);
                }}
                className="block mt-1 text-sm font-semibold underline underline-offset-2 hover:no-underline"
              >
                {t.action.label}
              </button>
            )}
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => removeToast(t.id)}
            className="text-white opacity-70 hover:opacity-100 transition-opacity ml-2"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
