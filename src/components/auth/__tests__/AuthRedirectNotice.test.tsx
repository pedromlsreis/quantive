import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { AuthRedirectNotice as Notice } from '@/lib/authRedirect';

const state = vi.hoisted(() => ({ notice: null as Notice | null }));
vi.mock('@/lib/authRedirect', () => ({ takeAuthRedirectNotice: () => state.notice }));

const { toast } = vi.hoisted(() => ({ toast: { error: vi.fn() } }));
vi.mock('sonner', () => ({ toast }));

import { AuthRedirectNotice } from '../AuthRedirectNotice';

beforeEach(() => {
  vi.clearAllMocks();
  state.notice = null;
});

describe('AuthRedirectNotice', () => {
  it('says plainly when the link expired or was used', () => {
    state.notice = { kind: 'link-error', expired: true };
    render(<AuthRedirectNotice />);
    expect(toast.error).toHaveBeenCalledWith('That link has expired or was already used. Request a new one.', expect.anything());
  });

  it('reports any other failed link', () => {
    state.notice = { kind: 'link-error', expired: false };
    render(<AuthRedirectNotice />);
    expect(toast.error).toHaveBeenCalledWith("That link didn't work. Request a new one.", expect.anything());
  });

  it('shows nothing without a notice', () => {
    render(<AuthRedirectNotice />);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
