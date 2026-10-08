import { createContext } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

/** Optional inline action ("Q14 failed — view") rendered as a button. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: ToastAction;
}

export interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number, action?: ToastAction) => void;
  removeToast: (id: string) => void;
}

/**
 * Plain (non-component) module so react-refresh keeps fast-refresh enabled
 * for the provider component file.
 */
export const ToastContext = createContext<ToastContextType | undefined>(undefined);
