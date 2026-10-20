import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, renderHook, fireEvent } from '@testing-library/react';

const reauthenticate = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ reauthenticate }) }));
vi.mock('@/lib/captcha', () => ({ isCaptchaEnabled: true, TURNSTILE_SITE_KEY: 'site-key' }));
// Stands in for Cloudflare's widget: a button that hands over a token.
vi.mock('@/components/auth/Turnstile', () => ({
  Turnstile: ({ onVerify }: { onVerify: (token: string) => void }) => (
    <button type="button" onClick={() => onVerify('turnstile-token')}>verify</button>
  ),
}));

import { usePasswordCheck } from '../usePasswordCheck';

beforeEach(() => {
  vi.clearAllMocks();
  reauthenticate.mockResolvedValue({ error: null });
});

describe('usePasswordCheck', () => {
  it('waits for Turnstile, signs in with its token, and needs a fresh token after', async () => {
    const { result } = renderHook(() => usePasswordCheck());
    expect(result.current.captchaPending).toBe(true);

    const widget = render(<>{result.current.captcha}</>);
    fireEvent.click(widget.getByRole('button', { name: 'verify' }));
    expect(result.current.captchaPending).toBe(false);

    let error: string | null | undefined;
    await act(async () => { error = await result.current.check('pw'); });
    expect(error).toBeNull();
    expect(reauthenticate).toHaveBeenCalledWith('pw', 'turnstile-token');
    expect(result.current.captchaPending).toBe(true);
  });

  it('maps a wrong password to plain copy', async () => {
    reauthenticate.mockResolvedValue({ error: 'Invalid login credentials' });
    const { result } = renderHook(() => usePasswordCheck());
    let error: string | null | undefined;
    await act(async () => { error = await result.current.check('wrong'); });
    expect(error).toBe("That password isn't right.");
  });
});
