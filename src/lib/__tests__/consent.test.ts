import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getConsent, setConsent, subscribeConsent } from '../consent';

const STORAGE_KEY = 'quantive_analytics_consent';

describe('analytics consent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no choice has been recorded', () => {
    expect(getConsent()).toBeNull();
  });

  it('returns the stored value after setConsent("granted")', () => {
    setConsent('granted');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('granted');
    expect(getConsent()).toBe('granted');
  });

  it('returns the stored value after setConsent("denied")', () => {
    setConsent('denied');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('denied');
    expect(getConsent()).toBe('denied');
  });

  it('overwrites a prior choice when set again', () => {
    setConsent('granted');
    setConsent('denied');
    expect(getConsent()).toBe('denied');
    setConsent('granted');
    expect(getConsent()).toBe('granted');
  });

  it('treats unrecognised stored values as no-choice', () => {
    localStorage.setItem(STORAGE_KEY, 'unknown');
    expect(getConsent()).toBeNull();
    localStorage.setItem(STORAGE_KEY, '');
    expect(getConsent()).toBeNull();
  });

  it('does not throw when localStorage.getItem fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => getConsent()).not.toThrow();
    expect(getConsent()).toBeNull();
    spy.mockRestore();
  });

  it('does not throw when localStorage.setItem fails (private mode / quota)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => setConsent('granted')).not.toThrow();
    spy.mockRestore();
  });

  it('still notifies listeners when the underlying write fails', () => {
    const listener = vi.fn();
    const unsub = subscribeConsent(listener);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    setConsent('granted');
    expect(listener).toHaveBeenCalledWith('granted');

    spy.mockRestore();
    unsub();
  });

  it('notifies subscribers when consent flips', () => {
    const listener = vi.fn();
    const unsub = subscribeConsent(listener);

    setConsent('granted');
    expect(listener).toHaveBeenCalledWith('granted');

    setConsent('denied');
    expect(listener).toHaveBeenCalledWith('denied');

    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsub = subscribeConsent(listener);
    setConsent('granted');
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    setConsent('denied');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports multiple independent subscribers', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeConsent(a);
    const unsubB = subscribeConsent(b);

    setConsent('granted');
    expect(a).toHaveBeenCalledWith('granted');
    expect(b).toHaveBeenCalledWith('granted');

    unsubA();
    setConsent('denied');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledWith('denied');
    expect(b).toHaveBeenCalledTimes(2);

    unsubB();
  });

  it('persists a choice across simulated reloads (storage is the source of truth)', () => {
    setConsent('granted');
    // Module state would survive a reload via localStorage. Verify the read path.
    expect(getConsent()).toBe('granted');
    localStorage.setItem(STORAGE_KEY, 'denied');
    expect(getConsent()).toBe('denied');
  });
});
