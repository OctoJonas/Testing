"use client";

import { useEffect, useState } from "react";

import { ConfigManager } from "@/services/configManager";
import type { Config } from "@/lib/types";

/**
 * Live list of saved widget configs. Subscribes to ConfigManager so a config
 * created or edited in the Settings tab immediately appears in every tab's
 * dropdown — no page reload required.
 */
export function useConfigs(): Config[] {
  const [configs, setConfigs] = useState<Config[]>(() => ConfigManager.getConfigs());
  // Initial render captures the current list; the subscription delivers every
  // create/edit/delete after that (same-tab via ConfigManager, cross-tab via
  // its storage-event bridge).
  useEffect(() => ConfigManager.subscribe(setConfigs), []);
  return configs;
}
