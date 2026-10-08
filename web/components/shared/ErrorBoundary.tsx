"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div role="alert" className="m-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <div className="font-semibold mb-1">Something went wrong.</div>
          <div className="text-xs text-red-700 mb-2">{this.state.error.message}</div>
          <button
            type="button"
            onClick={this.reset}
            className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
