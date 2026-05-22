import { describe, it, expect } from 'vitest';
import { reducer } from '../use-toast';

// `reducer` is the pure state machine behind the shadcn/ui toast hook. It is
// independently testable in isolation from React. The `dismiss` action has
// a side effect (it schedules a remove timeout) but the resulting state
// change (open: false) is observable here without needing fake timers.

type State = Parameters<typeof reducer>[0];
type Action = Parameters<typeof reducer>[1];

function makeToast(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Toast ${id}`,
    open: true,
    ...overrides,
  } as never;
}

describe('use-toast reducer — ADD_TOAST', () => {
  it('appends the new toast at the head of the list', () => {
    const initial: State = { toasts: [] };
    const next = reducer(initial, { type: 'ADD_TOAST', toast: makeToast('1') } as Action);
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].id).toBe('1');
  });

  it('caps the list at TOAST_LIMIT (1) by dropping older toasts', () => {
    // TOAST_LIMIT = 1 in the source. Newer toasts evict older ones.
    let state: State = { toasts: [] };
    state = reducer(state, { type: 'ADD_TOAST', toast: makeToast('1') } as Action);
    state = reducer(state, { type: 'ADD_TOAST', toast: makeToast('2') } as Action);
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].id).toBe('2');
  });

  it('is immutable — does not mutate the previous state', () => {
    const initial: State = { toasts: [makeToast('a')] };
    const next = reducer(initial, { type: 'ADD_TOAST', toast: makeToast('b') } as Action);
    expect(initial.toasts).toHaveLength(1);
    expect(initial.toasts[0].id).toBe('a');
    expect(next).not.toBe(initial);
  });
});

describe('use-toast reducer — UPDATE_TOAST', () => {
  it('shallow-merges the partial onto the matching id', () => {
    const initial: State = {
      toasts: [makeToast('1', { title: 'before', description: 'original' })],
    };
    const next = reducer(initial, {
      type: 'UPDATE_TOAST',
      toast: { id: '1', title: 'after' },
    } as Action);
    expect(next.toasts[0].title).toBe('after');
    // Other fields are preserved.
    expect(next.toasts[0].description).toBe('original');
  });

  it('is a no-op for an id that is not present', () => {
    const initial: State = { toasts: [makeToast('1')] };
    const next = reducer(initial, {
      type: 'UPDATE_TOAST',
      toast: { id: 'unknown', title: 'ghost' },
    } as Action);
    expect(next.toasts[0].title).toBe('Toast 1');
  });
});

describe('use-toast reducer — DISMISS_TOAST', () => {
  it('flips `open` to false for the targeted id', () => {
    const initial: State = { toasts: [makeToast('1', { open: true })] };
    const next = reducer(initial, { type: 'DISMISS_TOAST', toastId: '1' } as Action);
    expect(next.toasts[0].open).toBe(false);
  });

  it('flips `open` to false for ALL toasts when no id is provided', () => {
    // TOAST_LIMIT is 1 so we can't test more than one — but the reducer still
    // performs the "dismiss everything" branch and we can assert the loop.
    const initial: State = { toasts: [makeToast('1', { open: true })] };
    const next = reducer(initial, { type: 'DISMISS_TOAST' } as Action);
    expect(next.toasts.every((t) => t.open === false)).toBe(true);
  });

  it('does NOT remove the toast — removal is a separate step', () => {
    const initial: State = { toasts: [makeToast('1')] };
    const next = reducer(initial, { type: 'DISMISS_TOAST', toastId: '1' } as Action);
    expect(next.toasts).toHaveLength(1);
  });
});

describe('use-toast reducer — REMOVE_TOAST', () => {
  it('removes the matching id', () => {
    const initial: State = { toasts: [makeToast('1'), makeToast('2')] };
    const next = reducer(initial, { type: 'REMOVE_TOAST', toastId: '1' } as Action);
    expect(next.toasts.map((t) => t.id)).toEqual(['2']);
  });

  it('removes ALL toasts when no id is provided', () => {
    const initial: State = { toasts: [makeToast('1'), makeToast('2')] };
    const next = reducer(initial, { type: 'REMOVE_TOAST' } as Action);
    expect(next.toasts).toHaveLength(0);
  });

  it('is a no-op for an id that is not present', () => {
    const initial: State = { toasts: [makeToast('1')] };
    const next = reducer(initial, { type: 'REMOVE_TOAST', toastId: 'unknown' } as Action);
    expect(next.toasts).toHaveLength(1);
  });
});
