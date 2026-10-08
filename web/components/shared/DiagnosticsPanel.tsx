"use client";

import { useEffect, useState } from "react";
import {
  DiagnosticsBuffer,
  type DiagnosticsEntry,
} from "@/services/diagnosticsBuffer";

/**
 * Floating Diagnostics button + slide-in panel showing the last 200
 * widget-related Socket.IO events (transport plumbing is filtered out in
 * DiagnosticsBuffer). Lives outside the tab system so it's reachable from
 * every screen — useful when the Chat tab is mid-failure and the operator
 * wants to read the raw event sequence without opening DevTools.
 */
export default function DiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<DiagnosticsEntry[]>(() => DiagnosticsBuffer.snapshot());
  const [filter, setFilter] = useState("");

  useEffect(() => DiagnosticsBuffer.subscribe(setEntries), []);

  // Show oldest at top so the conversational order reads naturally.
  const visible = entries.filter((e) =>
    filter ? e.event.toLowerCase().includes(filter.toLowerCase()) : true,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open diagnostics panel"
        className="fixed bottom-4 left-4 z-40 px-3 py-2 bg-gray-800 text-white text-xs rounded-full shadow-lg hover:bg-gray-900 transition-colors"
      >
        🧰 Diagnostics ({entries.length})
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-stretch justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Diagnostics panel"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-2xl bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h2 className="font-semibold text-gray-900">Widget WebSocket events</h2>
                <p className="text-xs text-gray-500">
                  Last {entries.length} widget events (most recent at the bottom)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter event name…"
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <button
                  type="button"
                  onClick={() => DiagnosticsBuffer.clear()}
                  className="px-3 py-1 text-xs bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close diagnostics panel"
                  className="text-gray-500 hover:text-gray-900 px-2 text-xl"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1 bg-gray-50">
              {visible.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  {filter ? "No matching events." : "No events yet — interact with the UI to populate."}
                </div>
              ) : (
                visible.map((e) => (
                  <div key={e.id} className="flex gap-2">
                    <span className="text-gray-400 shrink-0 w-20">
                      {new Date(e.ts).toLocaleTimeString([], { hour12: false })}.
                      {String(e.ts % 1000).padStart(3, "0")}
                    </span>
                    <span
                      className={`font-semibold w-8 shrink-0 ${
                        e.direction === "in" ? "text-blue-600" : "text-emerald-600"
                      }`}
                    >
                      {e.direction === "in" ? "←" : "→"}
                    </span>
                    <span className="font-semibold text-gray-900 shrink-0 w-44 truncate">{e.event}</span>
                    <span className="text-gray-700 break-all">{e.payloadPreview}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
