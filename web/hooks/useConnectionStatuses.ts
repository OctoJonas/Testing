"use client";

import { useEffect, useState } from "react";
import {
  ConnectionStatusStore,
  type StatusMap,
} from "@/services/connectionStatusStore";

export function useConnectionStatuses(): StatusMap {
  const [snapshot, setSnapshot] = useState<StatusMap>(() => ConnectionStatusStore.get());
  useEffect(() => ConnectionStatusStore.subscribe(setSnapshot), []);
  return snapshot;
}
