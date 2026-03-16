import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 p-6 text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2 font-display tracking-tight">Something went wrong</h1>
          <p className="text-zinc-500 max-w-md mb-8">
            The application encountered an unexpected error. Please try refreshing the page.
          </p>
          
          {this.state.error && (
            <div className="bg-white p-4 rounded-xl border border-zinc-200 text-left w-full max-w-2xl mb-8 overflow-auto max-h-48 text-sm font-mono text-zinc-700 shadow-sm">
              {this.state.error.message}
            </div>
          )}

          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 bg-zinc-900 text-white px-6 py-3 rounded-xl font-medium hover:bg-zinc-800 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
