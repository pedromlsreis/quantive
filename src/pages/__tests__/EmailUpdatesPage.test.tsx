import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('@/components/layout/Brand', () => ({ Wordmark: () => <span>Quantive</span> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const submitEmailListAction = vi.hoisted(() => vi.fn());
vi.mock('@/lib/emailList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/emailList')>()),
  submitEmailListAction,
}));

import EmailUpdatesPage from '../EmailUpdatesPage';

const CONFIRM_TOKEN = 'A'.repeat(43);
const UNSUBSCRIBE_TOKEN = '0b0c8e3e-4c6f-4e8f-9a51-6f2d1c3b4a59';

function Where() {
  const { pathname, hash } = useLocation();
  return <output data-testid="where">{pathname + hash}</output>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/email-updates" element={<><EmailUpdatesPage /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EmailUpdatesPage', () => {
  it('says the link is incomplete without a token', () => {
    renderAt('/email-updates');
    expect(screen.getByRole('heading', { name: 'This link is incomplete' })).toBeInTheDocument();
  });

  it('takes the token out of the address bar', async () => {
    renderAt(`/email-updates#confirm=${CONFIRM_TOKEN}`);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/email-updates$/));
    expect(screen.getByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument();
  });

  it('confirms only on a click, then says the address is on the list', async () => {
    submitEmailListAction.mockResolvedValue('ok');
    renderAt(`/email-updates#confirm=${CONFIRM_TOKEN}`);
    expect(submitEmailListAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm my email' }));

    const done = await screen.findByRole('heading', { name: "You're on the list" });
    // The clicked button is gone, so focus moves to the outcome.
    expect(done).toHaveFocus();
    expect(submitEmailListAction).toHaveBeenCalledWith('confirm', CONFIRM_TOKEN);
    expect(screen.getByRole('link', { name: 'See what has shipped' })).toHaveAttribute('href', '/changelog');
  });

  it('unsubscribes from an unsubscribe link', async () => {
    submitEmailListAction.mockResolvedValue('ok');
    renderAt(`/email-updates#unsubscribe=${UNSUBSCRIBE_TOKEN}`);

    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }));

    expect(await screen.findByRole('heading', { name: "You're unsubscribed" })).toBeInTheDocument();
    expect(submitEmailListAction).toHaveBeenCalledWith('unsubscribe', UNSUBSCRIBE_TOKEN);
  });

  // Value: protects=while a request is in flight the button reads "Confirming…", is aria-busy, and further presses send nothing;
  // fails_when=the busy guard is dropped: a double-click sends a second confirm, whose invalid_link answer can replace the success view;
  // why_new=the other tests resolve the mocked request at once and never observe the in-flight state;
  // seam=none; no_claim=does not cover how email-list answers a repeated confirm
  it('sends one request however often the button is pressed while it is in flight', async () => {
    let settle!: (result: 'ok') => void;
    submitEmailListAction.mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    renderAt(`/email-updates#confirm=${CONFIRM_TOKEN}`);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm my email' }));
    const busy = screen.getByRole('button', { name: 'Confirming…' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(busy);
    fireEvent.click(busy);
    expect(submitEmailListAction).toHaveBeenCalledTimes(1);

    settle('ok');
    expect(await screen.findByRole('heading', { name: "You're on the list" })).toBeInTheDocument();
  });

  // A dead link points back to the signup form; a passing problem offers a retry instead.
  it.each([
    ['invalid_link', 'This link no longer works', false],
    ['expired', 'This link has expired', false],
    ['rate_limited', 'Too many attempts', true],
    ['failed', 'Something went wrong', true],
  ] as const)('shows the %s view with the action that can help', async (result, title, retry) => {
    submitEmailListAction.mockResolvedValue(result);
    renderAt(`/email-updates#confirm=${CONFIRM_TOKEN}`);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm my email' }));

    expect(await screen.findByRole('heading', { name: title })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Try again' }) !== null).toBe(retry);
    const leaveAgain = screen.queryByRole('link', { name: 'Leave your email again' });
    if (retry) expect(leaveAgain).toBeNull();
    else expect(leaveAgain).toHaveAttribute('href', '/#lp-close-h2');
  });

  it('offers a retry after a failure and returns to the confirm step', async () => {
    submitEmailListAction.mockResolvedValue('failed');
    renderAt(`/email-updates#confirm=${CONFIRM_TOKEN}`);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm my email' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(screen.getByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument();
  });
});
