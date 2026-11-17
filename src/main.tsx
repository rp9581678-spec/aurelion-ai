import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error || 'Unexpected error'),
    };
  }

  componentDidCatch(error: unknown) {
    console.error('[AURELION AI ErrorBoundary] Caught runtime error:', error);
  }

  handleResetAndReload = () => {
    try {
      window.localStorage.removeItem('aurelion_active_session_v1');
      window.localStorage.removeItem('aura_active_session_v1');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#07090E] p-6 text-center text-[#F1F5F9]">
          <div className="w-full max-w-md rounded-2xl border border-[#00F0FF]/30 bg-[#0F1420] p-6 shadow-2xl">
            <h1 className="font-display bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] bg-clip-text text-2xl font-bold tracking-[0.18em] text-transparent">
              AURELION AI RECOVERY
            </h1>
            <p className="mt-2 text-xs text-[#94A3B8]">
              A temporary display error occurred on this device. Your cloud and account data are safe.
            </p>
            {this.state.errorMessage && (
              <pre className="mt-3 max-h-24 overflow-auto rounded-lg border border-white/10 bg-[#07090E] p-2.5 text-left font-mono text-[11px] text-red-300">
                {this.state.errorMessage}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleResetAndReload}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#8B5CF6] px-4 py-2.5 text-sm font-semibold text-[#05070B] transition-opacity hover:opacity-95"
            >
              Reload AURELION AI Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root') || (() => {
  const el = document.createElement('div');
  el.id = 'root';
  document.body.appendChild(el);
  return el;
})();

(window as unknown as { __AURELION_MOUNTED__?: boolean }).__AURELION_MOUNTED__ = true;

createRoot(rootElement).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);

