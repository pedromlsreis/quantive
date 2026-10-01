import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ExtraPortfolioMeta } from '@/lib/portfolios';
import type { PendingInvite, PortfolioPerson } from '@/lib/portfolioSharing';

const state = {
  user: { id: 'u1' } as { id: string } | null,
  hasFamily: false,
  activePortfolioId: 'personal',
  extraPortfolios: [] as ExtraPortfolioMeta[],
  people: [] as PortfolioPerson[],
  invites: [] as PendingInvite[],
};
const portfolio = {
  switchPortfolio: vi.fn(async () => {}),
  createPortfolio: vi.fn(async () => true),
  renamePortfolio: vi.fn(async () => true),
  deletePortfolio: vi.fn(async () => true),
  leavePortfolio: vi.fn(async () => true),
  removePartner: vi.fn(async () => true),
  restorePortfolioVersion: vi.fn(async () => true),
};
const refresh = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/contexts/KeySessionContext', () => ({
  useKeySession: () => ({ getPortfolioKey: () => new Uint8Array(32) }),
}));
vi.mock('@/hooks/useEntitlements', () => ({
  useEntitlements: () => ({ has: (e: string) => state.hasFamily && e.startsWith('portfolios.') }),
}));
vi.mock('@/hooks/usePortfolioSharing', () => ({
  usePortfolioSharing: () => ({ people: state.people, invites: state.invites, refresh }),
}));
vi.mock('@/contexts/PortfolioContext', () => ({
  usePortfolio: () => ({
    activePortfolioId: state.activePortfolioId,
    extraPortfolios: state.extraPortfolios,
    ...portfolio,
  }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/analytics', () => ({ analytics: new Proxy({}, { get: () => vi.fn() }) }));

const { toast } = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('sonner', () => ({ toast }));

vi.mock('@/lib/portfolioSharing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/portfolioSharing')>();
  return { ...actual, createInvite: vi.fn(), revokeInvite: vi.fn() };
});
vi.mock('@/lib/portfolios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/portfolios')>();
  return { ...actual, listRevisions: vi.fn() };
});

import { createInvite, InviteError, revokeInvite } from '@/lib/portfolioSharing';
import { listRevisions } from '@/lib/portfolios';
import { PortfolioSettings } from '../PortfolioSettings';

const joint: ExtraPortfolioMeta = { id: 'p1', name: 'Joint', ownerId: 'u1', revision: 1, keyEpoch: 1, rotationDue: false };
const partner: PortfolioPerson = { portfolioId: 'p1', userId: 'u2', email: 'sam@example.com', isOwner: false };
const owner: PortfolioPerson = { portfolioId: 'p1', userId: 'u1', email: 'me@example.com', isOwner: true };

function renderSettings() {
  return render(<MemoryRouter><PortfolioSettings /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 'u1' };
  state.hasFamily = false;
  state.activePortfolioId = 'personal';
  state.extraPortfolios = [];
  state.people = [];
  state.invites = [];
});

describe('PortfolioSettings', () => {
  it('renders nothing without Family or extra portfolios', () => {
    const { container } = renderSettings();
    expect(container).toBeEmptyDOMElement();
  });

  it('creates a portfolio from the name field', async () => {
    state.hasFamily = true;
    renderSettings();
    fireEvent.change(screen.getByLabelText('New portfolio'), { target: { value: 'Company' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(portfolio.createPortfolio).toHaveBeenCalledWith('Company'));
  });

  it('offers delete and share only to the owner', () => {
    state.hasFamily = true;
    state.extraPortfolios = [joint, { ...joint, id: 'p2', name: 'Shared with me', ownerId: 'someone-else' }];
    renderSettings();
    expect(screen.getByRole('button', { name: 'Delete Joint' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share Joint' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Shared with me' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share Shared with me' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Leave Shared with me' })).toBeInTheDocument();
  });

  it('stops offering new portfolios at the limit of owned ones', () => {
    state.hasFamily = true;
    state.extraPortfolios = Array.from({ length: 5 }, (_, i) => ({ ...joint, id: `p${i}`, name: `P${i}` }));
    renderSettings();
    expect(screen.queryByLabelText('New portfolio')).toBeNull();
    expect(screen.getByText(/most portfolios allowed/i)).toBeInTheDocument();
  });

  it('creates an invite and shows its link once', async () => {
    state.hasFamily = true;
    state.extraPortfolios = [joint];
    vi.mocked(createInvite).mockResolvedValue({ inviteId: 'i1', link: 'https://usequantive.app/join/i1#k=secret' });
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Share Joint' }));
    fireEvent.change(screen.getByLabelText('Share Joint'), { target: { value: ' Sam@Example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }));

    await waitFor(() => expect(screen.getByLabelText('Invite link for sam@example.com')).toHaveValue('https://usequantive.app/join/i1#k=secret'));
    expect(vi.mocked(createInvite).mock.calls[0][1]).toMatchObject({ portfolioId: 'p1', keyEpoch: 1, email: 'sam@example.com' });
    expect(refresh).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByDisplayValue(/#k=/)).toBeNull();
  });

  it('explains why an invite was refused', async () => {
    state.hasFamily = true;
    state.extraPortfolios = [joint];
    vi.mocked(createInvite).mockRejectedValue(new InviteError('seat_taken'));
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Share Joint' }));
    fireEvent.change(screen.getByLabelText('Share Joint'), { target: { value: 'other@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/already share with someone else/)));
  });

  it('shows a pending invite, and cancels it', async () => {
    state.hasFamily = true;
    state.extraPortfolios = [joint];
    state.invites = [{ id: 'i1', portfolioId: 'p1', inviteeEmail: 'sam@example.com', expiresAt: '2030-01-08T00:00:00Z' }];
    vi.mocked(revokeInvite).mockResolvedValue();
    renderSettings();
    expect(screen.getByText(/Invite sent to sam@example.com/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the invite for Joint' }));
    await waitFor(() => expect(revokeInvite).toHaveBeenCalledWith(expect.anything(), 'i1'));
  });

  it('removes the partner after a confirmation', async () => {
    state.hasFamily = true;
    state.extraPortfolios = [joint];
    state.people = [owner, partner];
    renderSettings();
    expect(screen.getByText('Shared with sam@example.com.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share Joint' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove sam@example.com from Joint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove partner' }));
    await waitFor(() => expect(portfolio.removePartner).toHaveBeenCalledWith('p1', 'u2'));
  });

  it('lets the partner leave, naming the owner', async () => {
    state.user = { id: 'u2' };
    state.extraPortfolios = [joint];
    state.people = [owner, partner];
    renderSettings();
    expect(screen.getByText('Shared with you by me@example.com.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave Joint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave portfolio' }));
    await waitFor(() => expect(portfolio.leavePortfolio).toHaveBeenCalledWith('p1'));
  });

  it('lists earlier versions and restores one after a confirmation', async () => {
    state.hasFamily = true;
    state.extraPortfolios = [joint];
    state.people = [owner, partner];
    vi.mocked(listRevisions).mockResolvedValue([
      { revision: 3, keyEpoch: 1, savedBy: 'u2', savedAt: '2026-09-30T18:05:00Z' },
      { revision: 2, keyEpoch: 1, savedBy: 'u1', savedAt: '2026-09-29T08:00:00Z' },
    ]);
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Earlier versions of Joint' }));
    expect(await screen.findByText('by sam@example.com')).toBeInTheDocument();
    expect(screen.getByText('by you')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /^Restore the version from/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Restore this version' }));
    await waitFor(() => expect(portfolio.restorePortfolioVersion).toHaveBeenCalledWith('p1', 3));
  });
});
