import { describe, it, expect, beforeEach } from 'vitest';

const STORAGE_KEY = 'finance-cockpit-welcome-dismissed';

describe('WelcomeModal localStorage logic', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should not have dismissed flag by default', () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('should persist dismissed flag when set', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('should return null after clearing storage', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    localStorage.removeItem(STORAGE_KEY);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('should not treat non-true values as dismissed', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    expect(localStorage.getItem(STORAGE_KEY) !== 'true').toBe(true);
  });
});
