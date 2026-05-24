import React from 'react';
import { useLocation } from 'react-router-dom';
import { analytics } from '@/lib/analytics';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /**
   * When this value changes (e.g. on route navigation), a tripped boundary
   * resets itself. Lets one bad page stay bad without poisoning the rest of
   * the app — the user navigating away gets a clean shell instead of the
   * fallback persisting until manual reset.
   */
  resetKey?: string;
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
    analytics.captureException(error, {
      kind: 'react_error_boundary',
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
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

/**
 * ErrorBoundary that resets when the route pathname changes. Must be
 * rendered inside a <BrowserRouter>. Use this around AppRoutes so a
 * page-level crash does not persist when the user navigates away.
 */
export function RouteScopedErrorBoundary({ children, fallback }: Omit<Props, 'resetKey'>) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname} fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}
