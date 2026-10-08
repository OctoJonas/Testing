"use client";

import type { Config } from "@/lib/types";

interface ConfigSectionProps {
  configs: Config[];
  selectedConfig: string;
  isConfigured: boolean;
  onConfigChange: (configName: string) => void;
}

export default function ConfigSection({
  configs,
  selectedConfig,
  isConfigured,
  onConfigChange,
}: ConfigSectionProps) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex gap-2 items-center">
        <label className="text-sm font-semibold text-gray-700">Widget Config:</label>
        <select
          value={selectedConfig}
          onChange={(e) => onConfigChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent flex-1"
        >
          <option value="">Select a configuration...</option>
          {configs.map((config) => (
            <option key={config.name} value={config.name}>
              {config.name}
            </option>
          ))}
        </select>
        {isConfigured && <span className="text-green-600 text-sm font-medium">✓ Configured</span>}
        {selectedConfig && !isConfigured && (
          <span className="text-yellow-600 text-sm font-medium">⏳ Configuring...</span>
        )}
      </div>
    </div>
  );
}
