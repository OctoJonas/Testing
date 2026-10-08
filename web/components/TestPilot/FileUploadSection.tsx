"use client";

import { useRef } from "react";
import type { QAPair } from "@/lib/types";
import { useToast } from "@/contexts/useToast";

interface FileUploadSectionProps {
  qaPairs: QAPair[];
  fileName: string;
  /** True when the pairs were restored from a previous session, not uploaded now. */
  restored?: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearSuite?: () => void;
}

const MAX_FILE_BYTES = 16 * 1024 * 1024;

export default function FileUploadSection({
  qaPairs,
  fileName,
  restored = false,
  onFileUpload,
  onClearSuite,
}: FileUploadSectionProps) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.size > MAX_FILE_BYTES) {
      showToast(
        `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB; the limit is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
        "error",
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    onFileUpload(e);
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Upload Q&A Data</h3>
      <div className="space-y-4">
        <div>
          <label htmlFor="qa-excel-upload" className="block text-sm font-semibold text-gray-700 mb-1">
            Excel File (.xlsx, .xls)
          </label>
          <input
            ref={inputRef}
            id="qa-excel-upload"
            type="file"
            accept=".xlsx,.xls"
            onChange={handleChange}
            aria-describedby="qa-excel-upload-help"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p id="qa-excel-upload-help" className="mt-1 text-xs text-gray-500">
            Maximum file size: {MAX_FILE_BYTES / (1024 * 1024)} MB.
          </p>
        </div>
        {qaPairs.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-green-600 font-medium">
                ✓ Loaded {qaPairs.length} Q&A pairs from {fileName}
                {restored && (
                  <span className="text-gray-500 font-normal"> (restored from last session)</span>
                )}
              </span>
              {onClearSuite && (
                <button
                  type="button"
                  onClick={onClearSuite}
                  className="text-xs text-gray-500 hover:text-red-600 underline underline-offset-2"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="bg-white border border-gray-300 rounded-lg p-4 max-h-96 overflow-y-auto">
              <h4 className="font-semibold text-gray-800 mb-3">All Q&A Pairs ({qaPairs.length} total)</h4>
              <div className="space-y-3">
                {qaPairs.map((pair, idx) => (
                  <div key={idx} className="border-b border-gray-200 pb-3 last:border-0">
                    <div className="text-xs text-gray-500 mb-1">Q&A Pair #{idx + 1}</div>
                    <div className="mb-2">
                      <span className="text-xs font-medium text-gray-700">Frage: </span>
                      <span className="text-sm text-gray-900">{pair.Frage}</span>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-700">Erwartete Antwort: </span>
                      <span className="text-sm text-gray-600">{pair.Antwort}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
