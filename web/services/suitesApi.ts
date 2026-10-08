/** Browser-side client for the suite + run-history REST routes. */
import { API_URL } from "./api";
import type { QAPair, QATestResults } from "@/lib/types";

export interface SuiteSummary {
  id: string;
  name: string;
  fileName: string | null;
  pairCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Suite extends SuiteSummary {
  pairs: QAPair[];
}

export interface RunSummary {
  id: string;
  suiteId: string | null;
  configName: string | null;
  startedAt: string;
  total: number;
  passed: number;
  failed: number;
  infraErrors: number;
  threshold: number | null;
  model: string | null;
  latencyMedianMs: number | null;
  latencyP95Ms: number | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    const err = new Error(body?.error ?? `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body as T;
}

export const SuitesApi = {
  list: () => request<{ suites: SuiteSummary[] }>("/api/suites").then((r) => r.suites),
  get: (id: string) => request<{ suite: Suite }>(`/api/suites/${id}`).then((r) => r.suite),
  create: (args: { name: string; fileName?: string | null; pairs: QAPair[]; overwrite?: boolean }) =>
    request<{ suite: Suite }>("/api/suites", { method: "POST", body: JSON.stringify(args) }).then(
      (r) => r.suite,
    ),
  update: (id: string, args: { name?: string; pairs?: QAPair[]; fileName?: string | null }) =>
    request<{ suite: Suite }>(`/api/suites/${id}`, {
      method: "PUT",
      body: JSON.stringify(args),
    }).then((r) => r.suite),
  remove: (id: string) => request<{ ok: true }>(`/api/suites/${id}`, { method: "DELETE" }),
  runs: (id: string) => request<{ runs: RunSummary[] }>(`/api/suites/${id}/runs`).then((r) => r.runs),
  saveRun: (args: { suite_id: string; config_name?: string | null; results: QATestResults }) =>
    request<{ run: RunSummary }>("/api/runs", { method: "POST", body: JSON.stringify(args) }).then(
      (r) => r.run,
    ),
  runResults: (id: string) =>
    request<{ results: QATestResults }>(`/api/runs/${id}`).then((r) => r.results),
  deleteRun: (id: string) => request<{ ok: true }>(`/api/runs/${id}`, { method: "DELETE" }),
};
