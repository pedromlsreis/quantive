import { useState, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Turnstile } from '@/components/auth/Turnstile';
import { mapPasswordCheckError } from '@/lib/authError';
import { isCaptchaEnabled } from '@/lib/captcha';

/**
 * Signs in again with the current password, for the actions the server takes
 * only from a fresh password sign-in: changing the email or the password, and
 * deleting the account. Holds the Turnstile token that sign-in needs; render
 * `captcha` inside the form, and keep its submit disabled while
 * `captchaPending`.
 */
export function usePasswordCheck(): {
  check: (password: string) => Promise<string | null>;
  captchaPending: boolean;
  captcha: ReactNode;
} {
  const { reauthenticate } = useAuth();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const check = async (password: string) => {
    const { error } = await reauthenticate(password, captchaToken ?? undefined);
    // A Turnstile token works once; remount the widget for the next try.
    setCaptchaToken(null);
    setNonce((n) => n + 1);
    return error ? mapPasswordCheckError(error) : null;
  };

  return {
    check,
    captchaPending: isCaptchaEnabled && !captchaToken,
    captcha: (
      <Turnstile
        key={nonce}
        onVerify={setCaptchaToken}
        onExpire={() => setCaptchaToken(null)}
        onError={() => setCaptchaToken(null)}
      />
    ),
  };
}
