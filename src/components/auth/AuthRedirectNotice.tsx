import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { takeAuthRedirectNotice } from '@/lib/authRedirect';

/** Says so when this tab was opened from an emailed auth link that didn't work (see authRedirect.ts). */
export function AuthRedirectNotice() {
  const [notice] = useState(takeAuthRedirectNotice);

  useEffect(() => {
    if (!notice) return;
    toast.error(
      notice.expired
        ? 'That link has expired or was already used. Request a new one.'
        : "That link didn't work. Request a new one.",
      { duration: 10000 },
    );
  }, [notice]);

  return null;
}
