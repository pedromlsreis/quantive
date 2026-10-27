import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { EmailSignupError, submitEmailSignup } from '../emailSignup';

describe('submitEmailSignup', () => {
  beforeEach(() => invoke.mockReset());

  it('sends the address and token to email-signup and resolves once a confirmation was requested', async () => {
    invoke.mockResolvedValue({ data: { success: true, confirmation: 'requested' }, error: null });
    await expect(submitEmailSignup('sam@example.com', 'tok')).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('email-signup', { body: { email: 'sam@example.com', token: 'tok', source: 'landing' } });
  });

  // The function is deployed by hand, after the frontend; until then it answers
  // {success: true} and sends nothing, so the form must not say "check your inbox".
  it('rejects a success from a function that did not request a confirmation', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    await expect(submitEmailSignup('sam@example.com', null)).rejects.toBeInstanceOf(EmailSignupError);
  });

  it('rejects a failed request', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Failed to send confirmation') });
    await expect(submitEmailSignup('sam@example.com', null)).rejects.toBeInstanceOf(EmailSignupError);
  });
});
