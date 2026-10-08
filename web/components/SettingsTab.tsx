"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfigManager } from "@/services/configManager";
import { useToast } from "@/contexts/useToast";
import {
  type ConfigDraft,
  type FieldErrors,
  type FieldName,
  isValid,
  validateBaseUrl,
  validateConfigDraft,
  validateName,
  validateOrigin,
  validateReferer,
  validateWidgetId,
} from "@/lib/config-validation";
import type { Config } from "@/lib/types";

const EMPTY: ConfigDraft = { name: "", widgetId: "", baseUrl: "", origin: "", referer: "" };

interface FieldDef {
  name: FieldName;
  label: string;
  placeholder: string;
  help: string;
  monospace?: boolean;
  password?: boolean;
  validate: (v: string) => string | null;
}

const FIELDS: FieldDef[] = [
  {
    name: "name",
    label: "Configuration Name",
    placeholder: "e.g., Production, Staging, Test",
    help: "Any short label that helps you tell configs apart in the dropdown.",
    validate: validateName,
  },
  {
    name: "widgetId",
    label: "Widget ID",
    placeholder: "Base64 string from the embed snippet",
    help: "From the Octonomy platform → Agents → Embed Script. Looks like a base64 token.",
    monospace: true,
    password: true,
    validate: validateWidgetId,
  },
  {
    name: "baseUrl",
    label: "Base URL",
    placeholder: "https://your-tenant.octonomy.ai",
    help: "Your Octonomy platform URL — usually https://<tenant>.octonomy.ai.",
    validate: validateBaseUrl,
  },
  {
    name: "origin",
    label: "Origin",
    placeholder: "https://your-domain.com",
    help: "A domain you whitelisted in the widget's Embed Script settings. No trailing slash.",
    validate: validateOrigin,
  },
  {
    name: "referer",
    label: "Referer",
    placeholder: "https://your-domain.com/",
    help: "Same as Origin but with a trailing slash.",
    validate: validateReferer,
  },
];

export default function SettingsTab() {
  const { showToast } = useToast();
  const [configs, setConfigs] = useState<Config[]>(() => ConfigManager.getConfigs());
  const [formData, setFormData] = useState<ConfigDraft>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [showWidgetId, setShowWidgetId] = useState(false);
  const [editingOriginalName, setEditingOriginalName] = useState<string | null>(null);

  const liveErrors: FieldErrors = useMemo(() => validateConfigDraft(formData), [formData]);

  useEffect(() => {
    return ConfigManager.subscribe((next) => setConfigs(next));
  }, []);

  const loadConfigs = () => setConfigs(ConfigManager.getConfigs());

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleBlur = (name: FieldName) => () => {
    setTouched((t) => ({ ...t, [name]: true }));
  };

  const handleSaveConfig = () => {
    setTouched({ name: true, widgetId: true, baseUrl: true, origin: true, referer: true });
    if (!isValid(liveErrors)) {
      showToast("Please fix the highlighted fields before saving.", "warning");
      return;
    }
    if (
      editingOriginalName &&
      editingOriginalName !== formData.name &&
      configs.some((c) => c.name === formData.name)
    ) {
      showToast(`A configuration named "${formData.name}" already exists.`, "error");
      return;
    }
    if (editingOriginalName && editingOriginalName !== formData.name) {
      ConfigManager.deleteConfig(editingOriginalName);
    }
    ConfigManager.saveConfig({ ...formData, createdAt: new Date().toISOString() });
    ConfigManager.setLastUsedConfig(formData.name);
    loadConfigs();
    clearForm();
    showToast(`Configuration "${formData.name}" saved.`, "success");
  };

  const clearForm = () => {
    setFormData(EMPTY);
    setTouched({});
    setEditingOriginalName(null);
  };

  const handleEditConfig = (config: Config) => {
    setFormData({
      name: config.name,
      widgetId: config.widgetId,
      baseUrl: config.baseUrl,
      origin: config.origin,
      referer: config.referer,
    });
    setEditingOriginalName(config.name);
    setTouched({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteConfig = (name: string) => {
    if (!confirm(`Delete the configuration "${name}"?`)) return;
    ConfigManager.deleteConfig(name);
    if (ConfigManager.getLastUsedConfig() === name) {
      ConfigManager.setLastUsedConfig("");
    }
    loadConfigs();
    showToast(`Configuration "${name}" deleted.`, "info");
  };

  const renderField = (f: FieldDef) => {
    const touchedField = touched[f.name];
    const liveErr = liveErrors[f.name];
    const showErr = touchedField && liveErr;
    const value = formData[f.name];
    const isPassword = Boolean(f.password) && !showWidgetId;
    const inputType = isPassword ? "password" : "text";
    return (
      <div key={f.name}>
        <label htmlFor={`config-${f.name}`} className="block text-sm font-semibold text-gray-700 mb-1">
          {f.label}
        </label>
        <div className="relative">
          <input
            id={`config-${f.name}`}
            type={inputType}
            name={f.name}
            value={value}
            onChange={handleInputChange}
            onBlur={handleBlur(f.name)}
            placeholder={f.placeholder}
            aria-invalid={Boolean(showErr)}
            aria-describedby={`config-${f.name}-help`}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              f.monospace ? "font-mono" : ""
            } ${showErr ? "border-red-400" : "border-gray-300"} ${
              f.password ? "pr-20" : ""
            }`}
          />
          {f.password && (
            <button
              type="button"
              onClick={() => setShowWidgetId((s) => !s)}
              className="absolute inset-y-0 right-2 my-auto h-7 px-2 text-xs text-gray-600 hover:text-gray-900 bg-white"
              aria-label={showWidgetId ? "Hide Widget ID" : "Show Widget ID"}
            >
              {showWidgetId ? "Hide" : "Show"}
            </button>
          )}
        </div>
        <p id={`config-${f.name}-help`} className={`text-xs mt-1 ${showErr ? "text-red-600" : "text-gray-500"}`}>
          {showErr ? liveErr : f.help}
        </p>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-b-lg shadow-sm p-6">
      <div className="bg-gray-50 rounded-lg p-6 mb-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          {editingOriginalName ? `Edit "${editingOriginalName}"` : "Create New Configuration"}
        </h3>
        <div className="grid gap-4">
          {FIELDS.map(renderField)}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={!isValid(liveErrors)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingOriginalName ? "💾 Update" : "💾 Save Configuration"}
            </button>
            <button
              type="button"
              onClick={clearForm}
              className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              {editingOriginalName ? "Cancel" : "Clear Form"}
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Saved Configurations</h3>
        {configs.length === 0 ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <div className="text-5xl mb-3" aria-hidden>
              🚀
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">No configurations yet</h4>
            <p className="text-sm text-gray-700 max-w-md mx-auto">
              To get started, fill in the form above with the Widget ID, Base URL, Origin, and
              Referer from your Octonomy platform&apos;s Embed Script. The widget must be set to
              public on the platform side.
            </p>
            <a
              href="#tab-docs"
              className="inline-block mt-3 text-sm text-blue-600 hover:text-blue-700 underline"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("tab-docs")?.click();
              }}
            >
              See the Docs tab for a step-by-step guide →
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map((config) => (
              <div
                key={config.name}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 text-lg mb-2 truncate">{config.name}</h4>
                    <div className="space-y-1 text-sm text-gray-600">
                      <p className="break-all">
                        <span className="font-medium">Widget ID:</span>{" "}
                        <code className="font-mono text-xs bg-gray-50 px-1 py-0.5 rounded">
                          {config.widgetId.length > 24
                            ? `${config.widgetId.slice(0, 24)}…`
                            : config.widgetId}
                        </code>
                      </p>
                      <p className="break-all">
                        <span className="font-medium">Base URL:</span> {config.baseUrl}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        Created: {new Date(config.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="ml-4 flex flex-col gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEditConfig(config)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteConfig(config.name)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
