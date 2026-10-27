import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import { parseEmailListFragment, submitEmailListAction } from '../emailList';

const CONFIRM_TOKEN = 'A'.repeat(21) + '_-' + 'z'.repeat(20);
const UNSUBSCRIBE_TOKEN = '0b0c8e3e-4c6f-4e8f-9a51-6f2d1c3b4a59';

describe('parseEmailListFragment', () => {
  it('reads a confirm link and an unsubscribe link', () => {
    expect(parseEmailListFragment(`#confirm=${CONFIRM_TOKEN}`)).toEqual({ action: 'confirm', token: CONFIRM_TOKEN });
    expect(parseEmailListFragment(`#unsubscribe=${UNSUBSCRIBE_TOKEN}`)).toEqual({ action: 'unsubscribe', token: UNSUBSCRIBE_TOKEN });
  });

  it('rejects anything else, including a token under the wrong action', () => {
    for (const hash of [
      '',
      '#',
      `#t=${CONFIRM_TOKEN}`,
      `#confirm=${CONFIRM_TOKEN.slice(1)}`,
      `#confirm=${UNSUBSCRIBE_TOKEN}`,
      `#unsubscribe=${CONFIRM_TOKEN}`,
      `#unsubscribe=${UNSUBSCRIBE_TOKEN.toUpperCase()}`,
      `#confirm=${CONFIRM_TOKEN}&x=1`,
    ]) {
      expect(parseEmailListFragment(hash)).toBeNull();
    }
  });
});

describe('submitEmailListAction', () => {
  beforeEach(() => invoke.mockReset());

  const failWith = (body: unknown) => ({ error: { context: new Response(JSON.stringify(body), { status: 400 }) } });

  it('sends the action and token to email-list', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    await expect(submitEmailListAction('unsubscribe', UNSUBSCRIBE_TOKEN)).resolves.toBe('ok');
    expect(invoke).toHaveBeenCalledWith('email-list', { body: { action: 'unsubscribe', token: UNSUBSCRIBE_TOKEN } });
  });

  it.each(['expired', 'invalid_link', 'rate_limited'] as const)('passes the %s code through', async (code) => {
    invoke.mockResolvedValue(failWith({ error: code }));
    await expect(submitEmailListAction('confirm', CONFIRM_TOKEN)).resolves.toBe(code);
  });

  it('folds unknown codes and network errors into failed', async () => {
    invoke.mockResolvedValue(failWith({ error: 'server_error' }));
    await expect(submitEmailListAction('confirm', CONFIRM_TOKEN)).resolves.toBe('failed');
    invoke.mockResolvedValue({ error: new Error('network') });
    await expect(submitEmailListAction('confirm', CONFIRM_TOKEN)).resolves.toBe('failed');
  });
});
