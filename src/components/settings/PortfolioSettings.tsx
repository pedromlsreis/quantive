import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  MAX_EXTRA_PORTFOLIOS,
  PERSONAL_PORTFOLIO_ID,
  PERSONAL_PORTFOLIO_NAME,
  PORTFOLIO_NAME_MAX_LENGTH,
  type ExtraPortfolioMeta,
} from '@/lib/portfolios';
import { SettingsRow, SettingsSection } from './SettingsRows';

/**
 * Settings → Portfolios (Family): the personal portfolio plus up to five
 * others, each opened, renamed or deleted here. Renders only with the
 * Family plan or with extra portfolios already.
 */
export function PortfolioSettings() {
  const { user } = useAuth();
  const { has } = useEntitlements();
  const { extraPortfolios, activePortfolioId, switchPortfolio, createPortfolio } = usePortfolio();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const canCreate = has('portfolios.multiple');
  if (!user || (!canCreate && extraPortfolios.length === 0)) return null;
  const atLimit = extraPortfolios.length >= MAX_EXTRA_PORTFOLIOS;

  const handleCreate = async () => {
    setCreating(true);
    const ok = await createPortfolio(newName);
    setCreating(false);
    if (ok) setNewName('');
  };

  return (
    <SettingsSection id="portfolios" title="Portfolios">
      <SettingsRow label={PERSONAL_PORTFOLIO_NAME} description="Your own portfolio.">
        <OpenButton
          isOpen={activePortfolioId === PERSONAL_PORTFOLIO_ID}
          name={PERSONAL_PORTFOLIO_NAME}
          onOpen={() => void switchPortfolio(PERSONAL_PORTFOLIO_ID)}
        />
      </SettingsRow>

      {extraPortfolios.map((portfolio) => (
        <PortfolioRow key={portfolio.id} portfolio={portfolio} isOwner={portfolio.ownerId === user.id} />
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

function PortfolioRow({ portfolio, isOwner }: { portfolio: ExtraPortfolioMeta; isOwner: boolean }) {
  const { activePortfolioId, switchPortfolio, renamePortfolio, deletePortfolio } = usePortfolio();
  const [mode, setMode] = useState<'view' | 'rename' | 'confirm-delete'>('view');
  const [draft, setDraft] = useState(portfolio.name);
  const [busy, setBusy] = useState(false);
  const inputId = `rename-portfolio-${portfolio.id}`;

  const handleRename = async () => {
    setBusy(true);
    const ok = await renamePortfolio(portfolio.id, draft);
    setBusy(false);
    if (ok) setMode('view');
  };

  const handleDelete = async () => {
    setBusy(true);
    const ok = await deletePortfolio(portfolio.id);
    setBusy(false);
    if (!ok) setMode('view');
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
                if (e.key === 'Enter') void handleRename();
                if (e.key === 'Escape') setMode('view');
              }}
            />
          </label>
          <button type="button" onClick={() => void handleRename()} disabled={busy || !draft.trim()} className="q-btn q-btn--secondary q-btn--md">
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
        description="This deletes the portfolio and every entry in it. It can't be undone. Download a CSV from it first if you want a copy."
      >
        <div className="q-set-inline">
          <button type="button" onClick={() => void handleDelete()} disabled={busy} className="q-btn q-btn--danger q-btn--md">
            {busy ? 'Deleting…' : 'Delete portfolio'}
          </button>
          <button type="button" onClick={() => setMode('view')} disabled={busy} className="q-btn q-btn--ghost q-btn--md">
            Cancel
          </button>
        </div>
      </SettingsRow>
    );
  }

  return (
    <SettingsRow label={portfolio.name}>
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
        {isOwner && (
          <button type="button" onClick={() => setMode('confirm-delete')} className="q-link-btn" aria-label={`Delete ${portfolio.name}`}>
            Delete
          </button>
        )}
      </div>
    </SettingsRow>
  );
}
