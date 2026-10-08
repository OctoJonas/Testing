"use client";

import { useConnectionStatuses } from "@/hooks/useConnectionStatuses";
import type { ConnectionState, ContextKey } from "@/services/connectionStatusStore";
import type { TabType } from "@/lib/types";

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

interface TabDef {
  id: TabType;
  label: string;
  ctx: ContextKey | null;
}

const TABS: TabDef[] = [
  { id: "chat", label: "Chat", ctx: "chat" },
  { id: "settings", label: "Settings", ctx: null },
  { id: "testpilot", label: "Testpilot", ctx: "qa_test" },
  { id: "autonomous", label: "Autonomous", ctx: "autonomous" },
  { id: "docs", label: "Docs", ctx: null },
];

const STATE_COLOR: Record<ConnectionState, string> = {
  idle: "bg-gray-300",
  configuring: "bg-yellow-400 animate-pulse",
  authenticating: "bg-yellow-400 animate-pulse",
  connecting: "bg-yellow-400 animate-pulse",
  connected: "bg-green-500",
  error: "bg-red-500",
};

const STATE_LABEL: Record<ConnectionState, string> = {
  idle: "not connected",
  configuring: "configuring",
  authenticating: "authenticating",
  connecting: "connecting",
  connected: "connected",
  error: "error",
};

export default function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const statuses = useConnectionStatuses();

  return (
    <div
      role="tablist"
      aria-label="Sections"
      className="bg-white rounded-t-lg shadow-sm border-b border-gray-200 flex gap-1 p-1"
    >
      {TABS.map((tab) => {
        const state = tab.ctx ? statuses[tab.ctx] : null;
        const dotClass = state ? STATE_COLOR[state] : null;
        const dotLabel = state ? STATE_LABEL[state] : null;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            title={dotLabel ? `${tab.label} (${dotLabel})` : undefined}
            className={`px-6 py-3 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? "text-white bg-blue-600"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            {tab.label}
            {dotClass && (
              <span
                className={`inline-block w-2 h-2 rounded-full ${dotClass}`}
                aria-label={`Connection status: ${dotLabel}`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
