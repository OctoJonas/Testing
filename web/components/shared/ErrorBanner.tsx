"use client";

interface ErrorBannerProps {
  title: string;
  message: string;
  hint?: string;
  onDismiss?: () => void;
}

/**
 * Persistent inline error display for connection / auth failures.
 *
 * Toasts auto-dismiss after a few seconds, which is bad for failures the user
 * needs to act on (e.g. "set your widget to public"). This banner sticks
 * around until the user dismisses it or a successful retry replaces it.
 */
export default function ErrorBanner({ title, message, hint, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3"
    >
      <div className="text-red-600 text-xl shrink-0" aria-hidden>
        ⚠
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-red-900 text-sm">{title}</div>
        <div className="text-red-800 text-sm mt-1 break-words">{message}</div>
        {hint && <div className="text-red-700 text-xs mt-2">{hint}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-red-400 hover:text-red-700 text-lg shrink-0 -mt-1"
        >
          ✕
        </button>
      )}
    </div>
  );
}
