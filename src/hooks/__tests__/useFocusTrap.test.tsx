import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import React from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

// A component that wires up the focus trap ref to a container with focusable children.
function TrapBox({
  active,
  buttons = ['First', 'Second', 'Last'],
}: {
  active: boolean;
  buttons?: string[];
}) {
  const ref = useFocusTrap<HTMLDivElement>(active);
  return (
    <div ref={ref} data-testid="trap">
      {buttons.map(label => (
        <button key={label}>{label}</button>
      ))}
    </div>
  );
}

describe('useFocusTrap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not move focus when active is false', () => {
    const { getByText } = render(<TrapBox active={false} />);
    const first = getByText('First');
    first.focus();
    act(() => { vi.runAllTimers(); });
    // Focus should remain on "First" — the trap did not intervene.
    expect(document.activeElement).toBe(first);
  });

  it('focuses the first focusable element after the debounce when active is true', () => {
    const { getByText } = render(<TrapBox active={true} />);
    act(() => { vi.advanceTimersByTime(60); });
    expect(document.activeElement).toBe(getByText('First'));
  });

  it('wraps Tab from the last element back to the first', () => {
    const { getByText } = render(<TrapBox active={true} />);
    act(() => { vi.runAllTimers(); });

    const last = getByText('Last');
    last.focus();
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(getByText('First'));
  });

  it('wraps Shift+Tab from the first element back to the last', () => {
    const { getByText } = render(<TrapBox active={true} />);
    act(() => { vi.runAllTimers(); });

    const first = getByText('First');
    first.focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByText('Last'));
  });

  it('does not trap Tab when focus is on a middle element', () => {
    const { getByText } = render(<TrapBox active={true} />);
    act(() => { vi.runAllTimers(); });

    const second = getByText('Second');
    second.focus();

    // Tab from middle: should NOT call preventDefault (focus moves naturally).
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    document.dispatchEvent(event);
    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('restores focus to the previously focused element on unmount', () => {
    const outer = document.createElement('button');
    document.body.appendChild(outer);
    outer.focus();
    expect(document.activeElement).toBe(outer);

    const { unmount } = render(<TrapBox active={true} />);
    act(() => { vi.runAllTimers(); });

    unmount();
    expect(document.activeElement).toBe(outer);
    outer.remove();
  });

  it('does not throw when the container has no focusable children', () => {
    function EmptyTrap() {
      const ref = useFocusTrap<HTMLDivElement>(true);
      return <div ref={ref} />;
    }
    expect(() => {
      render(<EmptyTrap />);
      act(() => { vi.runAllTimers(); });
    }).not.toThrow();
  });

  it('skips elements with aria-hidden="true"', () => {
    function TrapWithHidden() {
      const ref = useFocusTrap<HTMLDivElement>(true);
      return (
        <div ref={ref}>
          <button aria-hidden="true">Hidden</button>
          <button>Visible</button>
        </div>
      );
    }
    const { getByText } = render(<TrapWithHidden />);
    act(() => { vi.runAllTimers(); });
    // First VISIBLE focusable element should receive focus.
    expect(document.activeElement).toBe(getByText('Visible'));
  });
});
