"use client";

import { useEffect, useState } from "react";

import { socketService, type ConnectionPhase } from "@/services/socketService";

/**
 * Global transport-status banner. Surfaces "Reconnecting…" / "Disconnected"
 * so a dropped socket is visible and reassuring (the session and any running
 * test resume automatically on reconnect) instead of the UI silently freezing.
 */
export default function ConnectionBanner() {
  const [phase, setPhase] = useState<ConnectionPhase>("connected");

  useEffect(() => socketService.onPhase(setPhase), []);

  if (phase === "connected") return null;

  const reconnecting = phase === "reconnecting";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-50 px-4 py-2 text-center text-sm font-medium text-white shadow ${
        reconnecting ? "bg-amber-500" : "bg-red-600"
      }`}
    >
      {reconnecting
        ? "Reconnecting to the server… your session and any running test will resume automatically."
        : "Disconnected from the server. Reload the page to reconnect."}
    </div>
  );
}
