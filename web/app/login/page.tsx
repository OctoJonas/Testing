"use client";

import { useState, type FormEvent } from "react";

const PIN_LENGTH_HINT = "Enter the PIN your operator shared with you.";

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failCount, setFailCount] = useState(0);
  const [locked, setLocked] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      if (res.ok) {
        // Read `next` from the URL so we land back on the deep link the
        // proxy sent us off from.
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next") ?? "/";
        // Use replace() so back button doesn't go to /login.
        window.location.replace(next);
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        failures?: number;
      } | null;
      setError(data?.error ?? `Login failed (HTTP ${res.status})`);
      if (res.status === 401) setFailCount(data?.failures ?? failCount + 1);
      setLocked(res.status === 429);
      setPin("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2" aria-hidden>
            🔒
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Octonomy Testing Suite</h1>
          <p className="text-sm text-gray-600 mt-1">{PIN_LENGTH_HINT}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="pin" className="block text-sm font-semibold text-gray-700 mb-1">
              PIN
            </label>
            <input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg tracking-widest font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "pin-error" : undefined}
            />
          </div>

          {error && (
            <div
              id="pin-error"
              role="alert"
              className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            >
              {error}
            </div>
          )}

          {failCount >= 3 && !locked && (
            <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Still not working? The PIN may have been rotated — check with whoever
              operates this deployment. Repeated failures temporarily lock login.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !pin.trim()}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Checking…" : "Unlock"}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          This PIN is a soft access control — not real security. Don&apos;t reuse it elsewhere.
        </p>
      </div>
    </div>
  );
}
