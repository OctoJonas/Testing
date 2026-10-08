"use client";

import { useEffect, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";

import Header from "@/components/Header";
import TabNavigation from "@/components/TabNavigation";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import DiagnosticsPanel from "@/components/shared/DiagnosticsPanel";
import ConnectionBanner from "@/components/shared/ConnectionBanner";
import { socketService } from "@/services/socketService";
import { ConfigManager } from "@/services/configManager";
import type { TabType } from "@/lib/types";

// Lazy-load each tab so the initial bundle ships only the chrome. next/dynamic
// is the App Router-native equivalent of React.lazy + Suspense.
const fallback = () => (
  <div
    className="bg-white rounded-b-lg shadow-sm p-12 text-center text-gray-500 text-sm"
    role="status"
    aria-live="polite"
  >
    Loading…
  </div>
);

const ChatTab = dynamic(() => import("@/components/ChatTab"), {
  ssr: false,
  loading: fallback,
}) as ComponentType;
const SettingsTab = dynamic(() => import("@/components/SettingsTab"), {
  ssr: false,
  loading: fallback,
}) as ComponentType;
const TestpilotTab = dynamic(() => import("@/components/TestpilotTab"), {
  ssr: false,
  loading: fallback,
}) as ComponentType;
const AutonomousTab = dynamic(() => import("@/components/AutonomousTab"), {
  ssr: false,
  loading: fallback,
}) as ComponentType;
const DocsTab = dynamic(() => import("@/components/DocsTab"), {
  ssr: false,
  loading: fallback,
}) as ComponentType;

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabType>("chat");

  useEffect(() => {
    socketService.connect();
    // Pull the shared config list (and migrate any local-only configs up).
    void ConfigManager.sync();
    return () => {
      socketService.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <ConnectionBanner />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Header />
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        <ErrorBoundary>
          <div style={{ display: activeTab === "chat" ? "block" : "none" }}>
            <ChatTab />
          </div>
          <div style={{ display: activeTab === "settings" ? "block" : "none" }}>
            <SettingsTab />
          </div>
          <div
            style={{ display: activeTab === "testpilot" ? "block" : "none" }}
          >
            <TestpilotTab />
          </div>
          <div
            style={{ display: activeTab === "autonomous" ? "block" : "none" }}
          >
            <AutonomousTab />
          </div>
          <div style={{ display: activeTab === "docs" ? "block" : "none" }}>
            <DocsTab />
          </div>
        </ErrorBoundary>
      </div>
      <DiagnosticsPanel />
    </div>
  );
}
