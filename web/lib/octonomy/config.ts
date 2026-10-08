/**
 * Octonomy AI client configuration. Mirrors octonomy_client/config.py.
 */
import type { ClientConfigInit } from "./types";

export class ClientConfig {
  widgetId: string;
  baseUrl: string;
  origin: string;
  referer: string;
  responseTimeoutSec: number;
  connectionTimeoutSec: number;
  verboseLogging: boolean;
  debugEnabled: boolean;

  constructor(init: ClientConfigInit) {
    this.widgetId = init.widgetId;
    this.baseUrl = init.baseUrl;
    this.origin = init.origin;
    this.referer = init.referer;
    this.responseTimeoutSec = init.responseTimeoutSec ?? 120;
    this.connectionTimeoutSec = init.connectionTimeoutSec ?? 10;
    this.verboseLogging = init.verboseLogging ?? false;
    this.debugEnabled = init.debugEnabled ?? false;
  }

  /** Convert https://x.poc.octonomy.ai → wss://x.poc.wss.octonomy.ai */
  getSocketUrl(): string {
    return this.baseUrl.replace("octonomy.ai", "wss.octonomy.ai");
  }

  /** Extract tenant prefix from base URL (everything before the first dot). */
  getTenant(): string {
    const afterScheme = this.baseUrl.split("//")[1] ?? "";
    return afterScheme.split(".")[0];
  }
}
