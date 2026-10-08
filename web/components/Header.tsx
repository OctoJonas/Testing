"use client";

import { useEffect, useState } from "react";

export default function Header() {
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // Fetch once on mount. /api/auth/status is the only auth endpoint that
  // works without a session cookie, so it's safe to call before login.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data === "object" && "authEnabled" in data) {
          setAuthEnabled(Boolean((data as { authEnabled?: boolean }).authEnabled));
        }
      })
      .catch(() => {
        /* ignore — Logout button just stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* fall through */
    }
    // Force-reload so the proxy re-evaluates the (now-missing) cookie and
    // bounces us back to /login.
    window.location.replace("/login");
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Octonomy Testing Suite</h1>
        <p className="text-sm text-gray-600 mt-1">
          Multi-context connection management - Configure each tab independently
        </p>
      </div>
      {authEnabled && (
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="text-sm text-gray-600 hover:text-red-700 underline disabled:opacity-50 shrink-0"
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      )}
    </div>
  );
}
