import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useModalLayer } from '@/hooks/useModalLayer';
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

/** The feedback form, opened from the account menu, the sidebar and the More sheet. */
export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [type, setType] = useState<FeedbackType>('feature');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const close = () => { if (!sending) onOpenChange(false); };
  useModalLayer(open, close);
  const trapRef = useFocusTrap<HTMLDivElement>(open, {
    initialFocus: () => document.getElementById('feedback-message'),
  });

  const shortcutLabel = useMemo(
    () => (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘ Enter' : 'Ctrl+Enter'),
    [],
  );

  useEffect(() => {
    if (!open) {
      setMessage('');
      setType('feature');
    }
  }, [open]);

  const trimmedLen = message.trim().length;
  const canSubmit = trimmedLen > 0 && trimmedLen <= MAX_LEN && !sending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('submit-feedback', {
        body: { type, message: message.trim() },
      });
      if (error) throw error;
      toast.success('Feedback sent. Thank you.');
      setMessage('');
      onOpenChange(false);
    } catch {
      toast.error("Couldn't send your feedback. Try again.");
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

  if (!open) return null;

  return createPortal(
    <div className="q-modal-backdrop q-modal-backdrop--top" onMouseDown={(e) => { if (e.target === e.currentTarget && !message.trim()) close(); }}>
      <div
        ref={trapRef}
        className="q-modal"
        style={{ maxWidth: 520 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        aria-describedby="feedback-sub"
      >
        <div className="q-modal-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="q-modal-title" id="feedback-title">Send feedback</h2>
            <p className="q-modal-sub" id="feedback-sub">
              {user ? 'What would make Quantive more useful to you?' : 'What would make Quantive more useful to you? No account needed.'}
            </p>
          </div>
          <button type="button" onClick={close} className="q-icon-btn" aria-label="Close">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="q-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="q-field">
            <span className="q-field-label" id="feedback-type-label">Type</span>
            <QTabs<FeedbackType>
              value={type}
              onChange={setType}
              options={TYPE_OPTIONS}
              size="sm"
              ariaLabel="Feedback type"
            />
          </div>

          <div className="q-field">
            <label className="q-field-label" htmlFor="feedback-message">Message</label>
            <span className="q-input q-input--textarea">
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={PLACEHOLDERS[type]}
                rows={5}
                maxLength={MAX_LEN}
                style={{ resize: 'none' }}
                aria-describedby={message.length >= COUNTER_THRESHOLD ? 'feedback-count' : undefined}
              />
            </span>
            {message.length >= COUNTER_THRESHOLD && (
              <span
                id="feedback-count"
                className="q-field-help"
                style={{ alignSelf: 'flex-end', fontVariantNumeric: 'tabular-nums', color: message.length >= MAX_LEN ? 'var(--negative)' : undefined }}
              >
                {`${message.length} of ${MAX_LEN} characters`}
              </span>
            )}
          </div>
        </div>

        <div className="q-modal-foot q-modal-foot--split">
          <span className="q-modal-shortcut" aria-hidden="true">{`${shortcutLabel} to send`}</span>
          <button type="button" onClick={close} className="q-btn q-btn--ghost q-btn--md" disabled={sending}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit} className="q-btn q-btn--primary q-btn--md">
            {sending ? 'Sending…' : 'Send feedback'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
