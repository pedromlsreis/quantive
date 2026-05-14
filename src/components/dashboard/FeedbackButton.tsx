import { useState } from 'react';
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

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>('feature');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { user } = useAuth();
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error('Please enter your feedback.');
      return;
    }
    if (trimmed.length > 2000) {
      toast.error('Feedback must be under 2000 characters.');
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
            <div className="q-modal-head">
              <div>
                <div className="q-modal-title" id="feedback-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                  <MessageSquarePlus className="h-5 w-5 text-primary" />
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
              <button type="button" onClick={() => setOpen(false)} className="q-icon-btn" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="q-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              <QTabs<FeedbackType>
                value={type}
                onChange={setType}
                options={TYPE_OPTIONS}
                size="sm"
                ariaLabel="Feedback type"
              />

              <label className="q-input q-input--textarea">
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Describe your idea or issue..."
                  rows={4}
                  maxLength={2000}
                  style={{ resize: 'none' }}
                />
              </label>
            </div>

            <div className="q-modal-foot">
              <button
                onClick={handleSubmit}
                disabled={sending || !message.trim()}
                className="q-btn q-btn--primary q-btn--md"
                style={{ width: '100%', opacity: sending || !message.trim() ? 0.5 : 1 }}
              >
                <Send className="h-4 w-4" />
                {sending ? 'Sending…' : 'Submit feedback'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
