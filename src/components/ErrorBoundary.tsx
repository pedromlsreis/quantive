import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <h2 className="mb-2 text-lg font-bold text-foreground">Something went wrong</h2>
            <p className="mb-4 text-sm text-muted-foreground">An unexpected error occurred while rendering this section.</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="q-btn q-btn--primary q-btn--md"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
