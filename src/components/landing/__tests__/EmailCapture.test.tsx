import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The privacy page's nav reaches into the auth contexts; the anchor check doesn't need it.
vi.mock('@/components/landing/StickyNav', () => ({ StickyNav: () => null }));
// emailSignup.ts imports the client, which throws without VITE_SUPABASE_* env.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const submitEmailSignup = vi.hoisted(() => vi.fn());
vi.mock('@/lib/emailSignup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/emailSignup')>()),
  submitEmailSignup,
}));

import { EmailCapture } from '../EmailCapture';
import PrivacyPolicy from '@/pages/PrivacyPolicy';

describe('EmailCapture', () => {
  // Value: protects=the help text links a section /privacy really renders, and a sent form tells the visitor to confirm from their inbox;
  // fails_when=a privacy heading edit orphans the #anchor, or the old "You're on the list" copy returns though nothing arrives before confirming;
  // why_new=EmailCapture has no test, and MarkdownLegal.test never checks the "Information we collect" id the link relies on;
  // seam=none; no_claim=does not cover Turnstile (off in tests), the email-signup function, or App.tsx scrolling to the anchor
  it('links the privacy section on what is collected, then asks the visitor to confirm from their inbox', async () => {
    submitEmailSignup.mockResolvedValue(undefined);
    const form = render(
      <MemoryRouter>
        <EmailCapture />
      </MemoryRouter>,
    );

    const href = screen.getByRole('link', { name: 'Privacy policy' }).getAttribute('href');
    expect(href).toBe('/privacy#information-we-collect');

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: ' sam@example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep me posted' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/Check your inbox at sam@example\.com\./);
    expect(status).toHaveTextContent(/a link there to confirm it/);
    expect(submitEmailSignup).toHaveBeenCalledWith('sam@example.com', null);
    form.unmount();

    // The page the link opens must render a heading carrying that id.
    render(
      <MemoryRouter initialEntries={[href!]}>
        <PrivacyPolicy />
      </MemoryRouter>,
    );
    const target = document.getElementById(new URL(href!, 'https://usequantive.app').hash.slice(1));
    expect(target?.tagName).toBe('H2');
    expect(target).toHaveTextContent('Information we collect');
  });
});
