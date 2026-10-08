"use client";

import type { Config } from "@/lib/types";

interface ConnectionPanelProps {
  configs: Config[];
  selectedConfig: string;
  connectionStatus: string;
  isConnected: boolean;
  isConnecting: boolean;
  onConfigChange: (configName: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSaveConversation: () => void;
}

export default function ConnectionPanel({
  configs,
  selectedConfig,
  connectionStatus,
  isConnected,
  isConnecting,
  onConfigChange,
  onConnect,
  onDisconnect,
  onSaveConversation,
}: ConnectionPanelProps) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Connection</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Configuration</label>
          <select
            value={selectedConfig}
            onChange={(e) => onConfigChange(e.target.value)}
            // Locked during the handshake too — switching mid-connect would
            // race the configure/authenticate/connect chain.
            disabled={isConnected || isConnecting}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">Select configuration...</option>
            {configs.map((config) => (
              <option key={config.name} value={config.name}>
                {config.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
          <div
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              isConnected
                ? "bg-green-100 text-green-800"
                : isConnecting
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {connectionStatus}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConnect}
          disabled={!selectedConfig || isConnected || isConnecting}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isConnecting ? "Connecting..." : "Connect"}
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={!isConnected}
          className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Disconnect
        </button>
        <button
          type="button"
          onClick={onSaveConversation}
          disabled={!isConnected}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          💾 Save Conversation
        </button>
      </div>
    </div>
  );
}
