import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@/lib/analytics', () => ({
  analytics: { captureException },
}));

import { ErrorBoundary } from '../ErrorBoundary';

function Boom({ shouldThrow = true }: { shouldThrow?: boolean }): JSX.Element {
  if (shouldThrow) throw new Error('boom');
  return <div>safe</div>;
}

beforeEach(() => {
  captureException.mockClear();
});

describe('ErrorBoundary', () => {
  it('renders children unchanged when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <div data-testid="ok">all good</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('ok')).toBeInTheDocument();
  });

  it('catches a thrown error and renders the default fallback UI', () => {
    // React + jsdom logs the uncaught render error to console.error — silence
    // it so the test output stays readable.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    errSpy.mockRestore();
  });

  it('forwards the error to analytics.captureException', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    const [errArg, infoArg] = captureException.mock.calls[0];
    expect(errArg).toBeInstanceOf(Error);
    expect(errArg.message).toBe('boom');
    expect(infoArg).toMatchObject({ kind: 'react_error_boundary' });
    errSpy.mockRestore();
  });

  it('renders a custom fallback when one is provided', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div data-testid="custom">custom fallback</div>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('custom')).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
    errSpy.mockRestore();
  });

  it('"Try again" resets the boundary so a healthy subtree can mount', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Use a ref-controlled flag so we can flip it without re-mounting the
    // boundary itself.
    let throwingNow = true;
    function ToggleableChild() {
      if (throwingNow) throw new Error('first render');
      return <div data-testid="recovered">recovered</div>;
    }

    render(
      <ErrorBoundary>
        <ToggleableChild />
      </ErrorBoundary>,
    );

    // Boundary caught the throw; default fallback is visible.
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();

    // Stop throwing on the next render and click "Try again".
    throwingNow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByTestId('recovered')).toBeInTheDocument();
    errSpy.mockRestore();
  });
});
