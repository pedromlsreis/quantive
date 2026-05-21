import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquarePlus, X, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { QTabs } from '@/components/ui/q-tabs';

type FeedbackType = 'feature' | 'improvement' | 'bug';

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: 'feature',     label: 'Feature' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'bug',         label: 'Bug report' },
];

const PLACEHOLDERS: Record<FeedbackType, string> = {
  feature:     'What would you like Quantive to do?',
  improvement: 'What could work better, and how?',
  bug:         'What went wrong, and what did you expect?',
};

const MAX_LEN = 2000;
const COUNTER_THRESHOLD = 1600;

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('feature');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  const isMac = useMemo(
    () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform),
    [],
  );
  const shortcutLabel = isMac ? '⌘ + Enter' : 'Ctrl + Enter';

  useEffect(() => {
    if (!open) {
      setMessage('');
      setType('feature');
    }
  }, [open]);

  const trimmedLen = message.trim().length;
  const canSubmit = trimmedLen > 0 && trimmedLen <= MAX_LEN && !sending;

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error('Please enter your feedback.');
      return;
    }
    if (trimmed.length > MAX_LEN) {
      toast.error(`Feedback must be under ${MAX_LEN} characters.`);
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('submit-feedback', {
        body: { type, message: trimmed },
      });
      if (error) throw error;
      toast.success('Thanks for your feedback! We appreciate it.');
      setMessage('');
      setOpen(false);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="q-btn q-btn--secondary q-btn--md"
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden sm:inline">Suggest a feature or improvement</span>
        <span className="sm:hidden">Feedback</span>
      </button>

      {open && createPortal(
        <div
          className="q-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-title"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div ref={trapRef} className="q-modal">
            <div
              className="q-modal-head"
              style={{ padding: 'var(--s-5) var(--s-5) var(--s-3)', alignItems: 'flex-start' }}
            >
              <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'flex-start' }}>
                <div
                  aria-hidden
                  style={{
                    width: 36, height: 36, flexShrink: 0,
                    display: 'grid', placeItems: 'center',
                    borderRadius: 'var(--r-3)',
                    background: 'var(--surface-soft)',
                    border: '1px solid var(--border-raw)',
                    color: 'hsl(var(--primary))',
                  }}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                </div>
                <div>
                  <div
                    className="q-modal-title"
                    id="feedback-title"
                    style={{ fontWeight: 600 }}
                  >
                    Share your feedback
                  </div>
                  <div className="q-modal-sub">
                    Help us improve Quantive with your ideas.
                    {!user && (
                      <span style={{ display: 'block', marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                        No account needed to submit feedback.
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="q-icon-btn" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="q-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              <div>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--fg-subtle)',
                    marginBottom: 'var(--s-2)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Type of feedback
                </div>
                <QTabs<FeedbackType>
                  value={type}
                  onChange={setType}
                  options={TYPE_OPTIONS}
                  size="sm"
                  ariaLabel="Feedback type"
                />
              </div>

              <div>
                <label className="q-input q-input--textarea">
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={PLACEHOLDERS[type]}
                    rows={4}
                    maxLength={MAX_LEN}
                    style={{ resize: 'none' }}
                  />
                </label>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    minHeight: 18,
                    marginTop: 'var(--s-1)',
                    fontSize: 'var(--text-xs)',
                    color: message.length >= MAX_LEN ? 'var(--negative, #c33)' : 'var(--fg-subtle)',
                    fontVariantNumeric: 'tabular-nums',
                    opacity: message.length >= COUNTER_THRESHOLD ? 1 : 0,
                    transition: 'opacity 150ms ease-out',
                  }}
                  aria-live="polite"
                >
                  {message.length} / {MAX_LEN}
                </div>
              </div>
            </div>

            <div className="q-modal-foot" style={{ display: 'block' }}>
              <FeedbackFooterControls
                shortcutLabel={shortcutLabel}
                onCancel={() => setOpen(false)}
                onSubmit={handleSubmit}
                canSubmit={canSubmit}
                sending={sending}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function FeedbackFooterControls({
  shortcutLabel,
  onCancel,
  onSubmit,
  canSubmit,
  sending,
}: {
  shortcutLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  sending: boolean;
}) {
  return (
    <>
      <style>{`
        .q-feedback-foot-row {
          display: flex;
          flex-direction: column-reverse;
          gap: var(--s-2);
          width: 100%;
        }
        .q-feedback-foot-row .q-feedback-cancel { width: 100%; }
        .q-feedback-foot-row .q-feedback-submit { width: 100%; }
        .q-feedback-shortcut {
          display: none;
          font-size: var(--text-xs);
          color: var(--fg-subtle);
          margin-right: auto;
          align-self: center;
          font-variant-numeric: tabular-nums;
        }
        @media (min-width: 560px) {
          .q-feedback-foot-row {
            flex-direction: row;
            justify-content: flex-end;
            align-items: center;
          }
          .q-feedback-foot-row .q-feedback-cancel,
          .q-feedback-foot-row .q-feedback-submit {
            width: auto;
          }
          .q-feedback-shortcut { display: inline-flex; }
        }
      `}</style>
      <div className="q-feedback-foot-row">
        <span className="q-feedback-shortcut" aria-hidden>
          {shortcutLabel} to send
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="q-btn q-btn--ghost q-btn--md q-feedback-cancel"
          disabled={sending}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="q-btn q-btn--primary q-btn--md q-feedback-submit"
          style={{ opacity: canSubmit ? 1 : 0.5 }}
        >
          <Send className="h-4 w-4" />
          {sending ? 'Sending…' : 'Send feedback'}
        </button>
      </div>
    </>
  );
}
