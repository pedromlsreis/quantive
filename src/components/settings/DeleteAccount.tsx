import { useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { usePasswordCheck } from '@/hooks/usePasswordCheck';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorCode } from '@/lib/functionError';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SettingsRow as Row, SettingsSection as Section } from './SettingsRows';

const DELETE_FAILED = "Couldn't delete your account. Try again.";

/**
 * Settings → Delete account. Asks for the password again: delete-account
 * takes only a fresh password sign-in, so a stolen session can't delete the
 * account.
 */
export function DeleteAccountSection({ sharesPortfolios }: { sharesPortfolios: boolean }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const passwordCheck = usePasswordCheck();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const canDelete = !deleting && password.length > 0 && !passwordCheck.captchaPending;

  const onOpenChange = (next: boolean) => {
    if (deleting) return;
    setOpen(next);
    setPassword('');
    setError(null);
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      const passwordError = await passwordCheck.check(password);
      if (passwordError) {
        setError(passwordError);
        return;
      }
      const { data, error: fnError } = await supabase.functions.invoke('delete-account');
      if (fnError || !data?.success) {
        const code = fnError ? await functionErrorCode(fnError) : undefined;
        setError(code === 'password_required' ? 'Enter your password again, then delete.' : DELETE_FAILED);
        return;
      }
      // PortfolioContext's user-id watcher wipes all client state when
      // signOut() flips user to null. See docs/security/encryption.md §8.3.
      await signOut();
      toast.success('Your account and entries are deleted');
      navigate('/');
    } catch {
      setError(DELETE_FAILED);
    } finally {
      setDeleting(false);
    }
  };

  // The action button would close the dialog; it stays open for a retry.
  const onDeleteClick = (e: MouseEvent) => {
    e.preventDefault();
    void handleDelete();
  };

  return (
    <Section id="delete" title="Delete account">
      <Row description="Permanently deletes your account and entries. Download a CSV first if you want a copy.">
        <button type="button" onClick={() => setOpen(true)} className="q-btn q-btn--danger q-btn--md">
          Delete account
        </button>
      </Row>

      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account, entries, profile and any feedback you sent are deleted permanently. This can't be undone.
              {sharesPortfolios &&
                " A portfolio you share passes to your partner, who keeps it; your other portfolios are deleted. You also leave any portfolio shared with you."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="q-field">
            <label className="q-field-label" htmlFor="delete-password">Your password</label>
            <span className="q-input">
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleDelete();
                  }
                }}
                aria-describedby={error ? 'delete-password-error' : undefined}
                autoFocus
              />
            </span>
            {error && (
              <p id="delete-password-error" role="alert" className="q-field-error" style={{ margin: 0 }}>
                {error}
              </p>
            )}
          </div>
          {passwordCheck.captcha}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDeleteClick} disabled={!canDelete} className="q-btn--destructive">
              {deleting ? 'Deleting…' : passwordCheck.captchaPending ? 'Checking your browser…' : 'Delete everything'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}
