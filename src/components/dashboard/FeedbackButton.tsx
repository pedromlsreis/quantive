import { useState } from 'react';
import { MessageSquarePlus, X, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'feature' | 'improvement' | 'bug'>('feature');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { user } = useAuth();

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
        className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm text-primary transition-all hover:bg-primary/10 hover:border-primary/40"
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden sm:inline">Suggest a feature or improvement</span>
        <span className="sm:hidden">Feedback</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-1 flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Share your feedback</h2>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              Help us improve Quantive with your ideas.
              {!user && <span className="block mt-1 text-xs text-muted-foreground/70">No account needed to submit feedback.</span>}
            </p>

            {/* Type selector */}
            <div className="mb-4 flex gap-2">
              {(['feature', 'improvement', 'bug'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    type === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'bug' ? 'Bug report' : t}
                </button>
              ))}
            </div>

            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Describe your idea or issue..."
              className="mb-4 w-full resize-none rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
              rows={4}
              maxLength={2000}
            />

            <button
              onClick={handleSubmit}
              disabled={sending || !message.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending...' : 'Submit feedback'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
