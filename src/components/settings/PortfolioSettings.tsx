import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { usePortfolioSharing } from '@/hooks/usePortfolioSharing';
import { supabase } from '@/integrations/supabase/client';
import { analytics } from '@/lib/analytics';
import { formatDate, formatDateShort } from '@/lib/formatters';
import {
  INVITE_LIFETIME_DAYS,
  InviteError,
  createInvite,
  revokeInvite,
  type InviteErrorCode,
  type PendingInvite,
  type PortfolioPerson,
} from '@/lib/portfolioSharing';
import {
  MAX_EXTRA_PORTFOLIOS,
  PERSONAL_PORTFOLIO_ID,
  PERSONAL_PORTFOLIO_NAME,
  PORTFOLIO_NAME_MAX_LENGTH,
  listRevisions,
  type ExtraPortfolioMeta,
  type PortfolioRevision,
} from '@/lib/portfolios';
import { SettingsRow, SettingsSection } from './SettingsRows';

const INVITE_ERRORS: Record<InviteErrorCode, string> = {
  seat_taken: 'You already share with someone else. A Family plan is shared by two people.',
  self_invite: "That's your own email address. Enter your partner's.",
  already_member: 'That person is already in this portfolio.',
  family_required: 'Sharing needs the Family plan.',
  rotation_due: "This portfolio is being re-encrypted after a partner left. Reload the page, then try again.",
  stale_epoch: "This portfolio's key changed. Reload the page, then try again.",
  invalid_email: 'Enter a valid email address.',
  forbidden: 'Only the owner of a portfolio can share it.',
  unknown: "Couldn't create the invite. Try again.",
};

/**
 * Settings → Portfolios (Family): the personal portfolio plus up to five
 * others, each opened, renamed, shared or deleted here. Renders only with
 * the Family plan or with extra portfolios already, which is how a partner
 * sees the portfolios shared with them.
 */
export function PortfolioSettings() {
  const { user } = useAuth();
  const { has } = useEntitlements();
  const { extraPortfolios, activePortfolioId, switchPortfolio, createPortfolio } = usePortfolio();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const canCreate = has('portfolios.multiple');
  const visible = !!user && (canCreate || extraPortfolios.length > 0);
  const sharing = usePortfolioSharing(visible, extraPortfolios.map((p) => p.id));
  if (!user || !visible) return null;
  const atLimit = extraPortfolios.filter((p) => p.ownerId === user.id).length >= MAX_EXTRA_PORTFOLIOS;

  const handleCreate = async () => {
    setCreating(true);
    const ok = await createPortfolio(newName);
    setCreating(false);
    if (ok) setNewName('');
  };

  return (
    <SettingsSection id="portfolios" title="Portfolios">
      <SettingsRow label={PERSONAL_PORTFOLIO_NAME} description="Your own portfolio. It is never shared.">
        <OpenButton
          isOpen={activePortfolioId === PERSONAL_PORTFOLIO_ID}
          name={PERSONAL_PORTFOLIO_NAME}
          onOpen={() => void switchPortfolio(PERSONAL_PORTFOLIO_ID)}
        />
      </SettingsRow>

      {extraPortfolios.map((portfolio) => (
        <PortfolioRow
          key={portfolio.id}
          portfolio={portfolio}
          userId={user.id}
          canShare={has('portfolios.share')}
          people={sharing.people.filter((p) => p.portfolioId === portfolio.id)}
          invite={sharing.invites.find((i) => i.portfolioId === portfolio.id) ?? null}
          onSharingChanged={sharing.refresh}
        />
      ))}

      {canCreate && (atLimit ? (
        <SettingsRow description={`You have the most portfolios allowed besides ${PERSONAL_PORTFOLIO_NAME}: ${MAX_EXTRA_PORTFOLIOS}.`} />
      ) : (
        <SettingsRow
          label="New portfolio"
          htmlFor="new-portfolio"
          description="A separate set of sources and entries, for example a joint account or a company."
        >
          <div className="q-set-inline">
            <label className="q-input" style={{ width: 220 }}>
              <input
                id="new-portfolio"
                type="text"
                value={newName}
                maxLength={PORTFOLIO_NAME_MAX_LENGTH}
                placeholder="e.g. Joint"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) void handleCreate(); }}
              />
            </label>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim()}
              className="q-btn q-btn--secondary q-btn--md"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}

function OpenButton({ isOpen, name, onOpen }: { isOpen: boolean; name: string; onOpen: () => void }) {
  if (isOpen) return <span className="q-set-value">Open now</span>;
  return (
    <button type="button" onClick={onOpen} className="q-link-btn" aria-label={`Open ${name}`}>
      Open
    </button>
  );
}

type Mode =
  | 'view'
  | 'rename'
  | 'confirm-delete'
  | 'share'
  | 'link'
  | 'confirm-remove'
  | 'confirm-leave'
  | 'history';

function sharingLine(isOwner: boolean, partner: PortfolioPerson | undefined, owner: PortfolioPerson | undefined, invite: PendingInvite | null): string | undefined {
  if (!isOwner) return owner ? `Shared with you by ${owner.email}.` : 'Shared with you.';
  if (partner) return `Shared with ${partner.email}.`;
  if (invite) return `Invite sent to ${invite.inviteeEmail}. The link works until ${formatDateShort(new Date(invite.expiresAt))}.`;
  return undefined;
}

function PortfolioRow({ portfolio, userId, canShare, people, invite, onSharingChanged }: {
  portfolio: ExtraPortfolioMeta;
  userId: string;
  canShare: boolean;
  people: PortfolioPerson[];
  invite: PendingInvite | null;
  onSharingChanged: () => void;
}) {
  const { activePortfolioId, switchPortfolio, renamePortfolio, deletePortfolio, leavePortfolio, removePartner } = usePortfolio();
  const { getPortfolioKey } = useKeySession();
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState(portfolio.name);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = `rename-portfolio-${portfolio.id}`;
  const emailId = `share-portfolio-${portfolio.id}`;
  const linkId = `invite-link-${portfolio.id}`;

  const isOwner = portfolio.ownerId === userId;
  const partner = people.find((p) => !p.isOwner);
  const owner = people.find((p) => p.isOwner);

  const run = async (action: () => Promise<boolean>, next: Mode = 'view') => {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok) setMode(next);
    return ok;
  };

  const handleInvite = async () => {
    const portfolioKey = getPortfolioKey(portfolio.id);
    if (!portfolioKey) {
      toast.info('Unlock your data to share this portfolio.', { id: 'sync-locked' });
      return;
    }
    const invitee = email.trim().toLowerCase();
    await run(async () => {
      try {
        const created = await createInvite(supabase, {
          portfolioId: portfolio.id,
          keyEpoch: portfolio.keyEpoch,
          portfolioKey,
          email: invitee,
          origin: window.location.origin,
        });
        setLink({ email: invitee, url: created.link });
        analytics.inviteCreated();
        onSharingChanged();
        return true;
      } catch (e) {
        if (!(e instanceof InviteError)) console.error('[sharing] invite failed:', e);
        toast.error(INVITE_ERRORS[e instanceof InviteError ? e.code : 'unknown']);
        return false;
      }
    }, 'link');
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success('Link copied.');
    } catch {
      (document.getElementById(linkId) as HTMLInputElement | null)?.select();
      toast.info('Select the link and copy it.');
    }
  };

  const handleRevoke = async () => {
    if (!invite) return;
    await run(async () => {
      try {
        await revokeInvite(supabase, invite.id);
        onSharingChanged();
        return true;
      } catch (e) {
        console.error('[sharing] revoke failed:', e);
        toast.error("Couldn't cancel the invite. Try again.");
        return false;
      }
    });
  };

  if (mode === 'rename') {
    return (
      <SettingsRow label="Rename portfolio" htmlFor={inputId}>
        <div className="q-set-inline">
          <label className="q-input" style={{ width: 220 }}>
            <input
              id={inputId}
              type="text"
              value={draft}
              maxLength={PORTFOLIO_NAME_MAX_LENGTH}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void run(() => renamePortfolio(portfolio.id, draft));
                if (e.key === 'Escape') setMode('view');
              }}
            />
          </label>
          <button type="button" onClick={() => void run(() => renamePortfolio(portfolio.id, draft))} disabled={busy || !draft.trim()} className="q-btn q-btn--secondary q-btn--md">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setMode('view')} className="q-btn q-btn--ghost q-btn--md">
            Cancel
          </button>
        </div>
      </SettingsRow>
    );
  }

  if (mode === 'confirm-delete') {
    return (
      <SettingsRow
        label={`Delete ${portfolio.name}?`}
        description={partner
          ? `This deletes the portfolio and every entry in it, for ${partner.email} too. It can't be undone. Download a CSV from it first if you want a copy.`
          : "This deletes the portfolio and every entry in it. It can't be undone. Download a CSV from it first if you want a copy."}
      >
        <div className="q-set-inline">
          <button type="button" onClick={() => void run(() => deletePortfolio(portfolio.id))} disabled={busy} className="q-btn q-btn--danger q-btn--md">
            {busy ? 'Deleting…' : 'Delete portfolio'}
          </button>
          <button type="button" onClick={() => setMode('view')} disabled={busy} className="q-btn q-btn--ghost q-btn--md">
            Cancel
          </button>
        </div>
      </SettingsRow>
    );
  }

  if (mode === 'share') {
    return (
      <SettingsRow
        label={`Share ${portfolio.name}`}
        htmlFor={emailId}
        description="Enter the email address your partner uses for Quantive, or will sign up with. You'll get a link to send them."
      >
        <div className="q-set-inline">
          <label className="q-input" style={{ width: 240 }}>
            <input
              id={emailId}
              type="email"
              autoComplete="off"
              value={email}
              autoFocus
              placeholder="name@example.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && email.trim()) void handleInvite();
                if (e.key === 'Escape') setMode('view');
              }}
            />
          </label>
          <button type="button" onClick={() => void handleInvite()} disabled={busy || !email.trim()} className="q-btn q-btn--secondary q-btn--md">
            {busy ? 'Creating…' : 'Create invite link'}
          </button>
          <button type="button" onClick={() => setMode('view')} disabled={busy} className="q-btn q-btn--ghost q-btn--md">
            Cancel
          </button>
        </div>
      </SettingsRow>
    );
  }

  if (mode === 'link' && link) {
    return (
      <SettingsRow
        label={`Invite link for ${link.email}`}
        htmlFor={linkId}
        description={`Send it to ${link.email} yourself, by message or email. It works once, for ${INVITE_LIFETIME_DAYS} days, and only for someone signed in as ${link.email}. The link carries the key to this portfolio, so it isn't shown again: if it's lost, create a new one.`}
      >
        <div className="q-set-inline">
          <label className="q-input" style={{ width: 280 }}>
            <input id={linkId} type="text" readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <button type="button" onClick={() => void handleCopy()} className="q-btn q-btn--secondary q-btn--md">
            Copy link
          </button>
          <button type="button" onClick={() => { setLink(null); setMode('view'); }} className="q-btn q-btn--ghost q-btn--md">
            Done
          </button>
        </div>
      </SettingsRow>
    );
  }

  if (mode === 'confirm-remove' && partner) {
    return (
      <SettingsRow
        label={`Remove ${partner.email}?`}
        description="They lose access straight away, and the portfolio is re-encrypted under a new key. Anything they already saw or exported stays with them."
      >
        <div className="q-set-inline">
          <button type="button" onClick={() => void run(async () => {
            const ok = await removePartner(portfolio.id, partner.userId);
            if (ok) onSharingChanged();
            return ok;
          })} disabled={busy} className="q-btn q-btn--danger q-btn--md">
            {busy ? 'Removing…' : 'Remove partner'}
          </button>
          <button type="button" onClick={() => setMode('view')} disabled={busy} className="q-btn q-btn--ghost q-btn--md">
            Cancel
          </button>
        </div>
      </SettingsRow>
    );
  }

  if (mode === 'confirm-leave') {
    return (
      <SettingsRow
        label={`Leave ${portfolio.name}?`}
        description={`You lose access to it straight away${owner ? `, and ${owner.email} keeps it` : ''}. To come back you'd need a new invite.`}
      >
        <div className="q-set-inline">
          <button type="button" onClick={() => void run(() => leavePortfolio(portfolio.id))} disabled={busy} className="q-btn q-btn--danger q-btn--md">
            {busy ? 'Leaving…' : 'Leave portfolio'}
          </button>
          <button type="button" onClick={() => setMode('view')} disabled={busy} className="q-btn q-btn--ghost q-btn--md">
            Cancel
          </button>
        </div>
      </SettingsRow>
    );
  }

  if (mode === 'history') {
    return <VersionHistory portfolio={portfolio} userId={userId} people={people} onClose={() => setMode('view')} />;
  }

  return (
    <SettingsRow label={portfolio.name} description={sharingLine(isOwner, partner, owner, invite)}>
      <div className="q-set-inline">
        <OpenButton
          isOpen={activePortfolioId === portfolio.id}
          name={portfolio.name}
          onOpen={() => void switchPortfolio(portfolio.id)}
        />
        <button
          type="button"
          onClick={() => { setDraft(portfolio.name); setMode('rename'); }}
          className="q-link-btn"
          aria-label={`Rename ${portfolio.name}`}
        >
          Rename
        </button>
        {isOwner && canShare && !partner && (
          <button
            type="button"
            onClick={() => { setEmail(invite?.inviteeEmail ?? ''); setMode('share'); }}
            className="q-link-btn"
            aria-label={invite ? `Create a new invite link for ${portfolio.name}` : `Share ${portfolio.name}`}
          >
            {invite ? 'New link' : 'Share'}
          </button>
        )}
        {isOwner && invite && !partner && (
          <button type="button" onClick={() => void handleRevoke()} disabled={busy} className="q-link-btn" aria-label={`Cancel the invite for ${portfolio.name}`}>
            Cancel invite
          </button>
        )}
        {isOwner && partner && (
          <button type="button" onClick={() => setMode('confirm-remove')} className="q-link-btn" aria-label={`Remove ${partner.email} from ${portfolio.name}`}>
            Remove partner
          </button>
        )}
        {!isOwner && (
          <button type="button" onClick={() => setMode('confirm-leave')} className="q-link-btn" aria-label={`Leave ${portfolio.name}`}>
            Leave
          </button>
        )}
        <button type="button" onClick={() => setMode('history')} className="q-link-btn" aria-label={`Earlier versions of ${portfolio.name}`}>
          Earlier versions
        </button>
        {isOwner && (
          <button type="button" onClick={() => setMode('confirm-delete')} className="q-link-btn" aria-label={`Delete ${portfolio.name}`}>
            Delete
          </button>
        )}
      </div>
    </SettingsRow>
  );
}

function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(d)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * The versions earlier saves replaced (portfolio_revisions). Restoring saves
 * the chosen version as a new one, so a restore can be undone from here too.
 */
function VersionHistory({ portfolio, userId, people, onClose }: {
  portfolio: ExtraPortfolioMeta;
  userId: string;
  people: PortfolioPerson[];
  onClose: () => void;
}) {
  const { restorePortfolioVersion } = usePortfolio();
  const [versions, setVersions] = useState<PortfolioRevision[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = portfolio.ownerId === userId;

  useEffect(() => {
    let cancelled = false;
    listRevisions(supabase, portfolio.id)
      .then((all) => {
        // Versions from before a key rotation open only with the retired key,
        // which only the owner keeps.
        if (!cancelled) setVersions(all.filter((v) => isOwner || v.keyEpoch === portfolio.keyEpoch));
      })
      .catch((e) => {
        console.error('[portfolios] versions failed:', e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [portfolio.id, portfolio.keyEpoch, isOwner]);

  const savedBy = (id: string | null) => {
    if (id === userId) return 'you';
    const person = people.find((p) => p.userId === id);
    return person ? person.email : 'a former member';
  };

  const restore = async (revision: number) => {
    setBusy(true);
    const ok = await restorePortfolioVersion(portfolio.id, revision);
    setBusy(false);
    if (ok) {
      toast.success('Version restored.');
      onClose();
    }
  };

  const description = failed
    ? "Couldn't load earlier versions. Try again."
    : versions === null
      ? 'Loading…'
      : versions.length === 0
        ? 'No earlier versions yet. Each save keeps the one it replaced, up to 20.'
        : 'Each save keeps the version it replaced, up to 20. Restoring saves that version as the current one, so you can undo it here too.';

  return (
    <SettingsRow label={`Earlier versions of ${portfolio.name}`} description={description}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', alignItems: 'flex-start' }}>
        {versions && versions.length > 0 && (
          <ul className="q-portfolio-versions">
            {versions.map((v) => (
              <li key={v.revision}>
                <span className="q-set-value">{formatSavedAt(v.savedAt)}</span>
                <span className="q-portfolio-versions-by">by {savedBy(v.savedBy)}</span>
                {confirming === v.revision ? (
                  <span className="q-set-inline">
                    <button type="button" onClick={() => void restore(v.revision)} disabled={busy} className="q-btn q-btn--secondary q-btn--sm">
                      {busy ? 'Restoring…' : 'Restore this version'}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} disabled={busy} className="q-btn q-btn--ghost q-btn--sm">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(v.revision)}
                    className="q-link-btn"
                    aria-label={`Restore the version from ${formatSavedAt(v.savedAt)}`}
                  >
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={onClose} className="q-btn q-btn--ghost q-btn--md">
          Close
        </button>
      </div>
    </SettingsRow>
  );
}
