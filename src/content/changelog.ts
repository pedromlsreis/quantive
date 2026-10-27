// The public changelog at /changelog, newest first. A user-facing PR adds its
// entry in the same PR. A security fix gets its entry in a follow-up commit
// once frontend, edge functions and migrations are all live, since edge
// functions deploy by hand. changelog.test.ts enforces the format and copy rules.

export type ChangelogPlan = 'pro' | 'family';

export interface ChangelogEntry {
  /** Anchor for /changelog#id. Starts with a letter: App.tsx only scrolls to such ids. */
  id: string;
  /** Day the change went live, YYYY-MM-DD. */
  date: string;
  /** Leads with a verb (removals start with "Removed"); sentence case, no full stop. */
  title: string;
  /** One to three plain sentences: what changed for the user, and where to find it. */
  body: string;
  /** Set when the change needs a paid plan. */
  plan?: ChangelogPlan;
  /** A fix where user data or accounts were at stake. States the impact, never the mechanism. */
  security?: true;
  /** Only when a feedback row, an email or a written record ties feedback to the change. */
  feedback?: true;
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: 'confirm-update-emails',
    date: '2026-10-27',
    title: 'Confirm your address before product updates start',
    body: 'Leaving your email under "Keep me posted" now sends one confirmation email first, and nothing else arrives until you confirm. Every update carries an unsubscribe link that deletes your address from the list.',
  },
  {
    id: 'change-sign-in-email',
    date: '2026-10-20',
    title: 'Change the email you sign in with',
    body: 'Settings → Profile → Email lets you change the address you sign in with. You confirm with your current password and a link sent to the new address, and your billing email follows.',
    feedback: true,
  },
  {
    id: 'current-password-required',
    date: '2026-10-20',
    title: 'Confirm your current password before changing it',
    body: "Changing your password in Settings now asks for the current one first, so someone with brief access to an unlocked session can't lock you out of your account.",
    security: true,
  },
  {
    id: 'share-a-portfolio',
    date: '2026-10-01',
    title: 'Share a portfolio with your partner',
    body: 'The Family plan (€14 a month or €120 a year) gives two people Pro each, plus portfolios they share. Your partner joins through an invite link that carries the portfolio key, so the key never reaches Quantive.',
    plan: 'family',
  },
  {
    id: 'extra-portfolios',
    date: '2026-10-01',
    title: 'Keep up to five portfolios beside your personal one',
    body: 'Each extra portfolio has its own encryption key, and the sidebar switches between them. Your personal portfolio is never shared.',
    plan: 'family',
  },
  {
    id: 'what-moved',
    date: '2026-09-30',
    title: 'See what moved since your last entry',
    body: 'The overview now leads with your net worth and its change since the previous entry, then lists the sources that moved. The chart below it can be scrubbed by pointer, touch or keyboard.',
  },
  {
    id: 'csv-export-free',
    date: '2026-09-30',
    title: 'Export your full history to CSV on every plan',
    body: 'CSV export in Settings is no longer limited to Pro. The file holds every entry you have recorded, including entries older than 12 months.',
  },
  {
    id: 'removed-streak-and-donut',
    date: '2026-09-30',
    title: 'Removed the entry streak and the donut chart',
    body: 'Saving an entry now updates the overview figure in place, with no streak counter or success panel. Allocations show a treemap or ranked bars instead of the donut.',
  },
  {
    id: 'south-african-rand',
    date: '2026-07-28',
    title: 'Track your net worth in South African rand',
    body: 'ZAR joins the display currencies, bringing the total to 14. Past entries convert at the rate of their own day.',
    feedback: true,
  },
  {
    id: 'idle-auto-lock',
    date: '2026-06-17',
    title: 'Lock the app automatically when you step away',
    body: 'Settings → Preferences → Auto-lock when idle drops your encryption key from memory after 5 to 60 minutes without activity. You stay signed in and unlock with your password.',
  },
  {
    id: 'hide-values-switch-away',
    date: '2026-05-31',
    title: 'Hide amounts when you switch away',
    body: 'A preference in Settings blurs every amount while the Quantive tab is in the background, for shared screens and presenting.',
  },
  {
    id: 'undo-deleted-entry',
    date: '2026-05-31',
    title: 'Undo deleting an entry',
    body: 'Deleting a single value now shows a notice with an Undo button for six seconds.',
  },
  {
    id: 'entry-reminders',
    date: '2026-05-30',
    title: 'Get a reminder to update your balances',
    body: 'Settings → Preferences → Entry reminders can email you every month, every three months or every six months. A reminder only goes out after a full cycle without an update, and it never reads your encrypted data.',
  },
  {
    id: 'rename-source',
    date: '2026-05-28',
    title: 'Rename a source',
    body: 'Rename a source from its action menu on the Sources page. The new name applies to every past entry.',
  },
  {
    id: 'edit-past-entries',
    date: '2026-05-22',
    title: 'Edit or delete a single past entry',
    body: 'Sources → Edit values lists every entry for a source. Fix a value or its currency, or delete it.',
  },
  {
    id: 'pro-plan',
    date: '2026-05-20',
    title: 'Go beyond 12 months with Pro',
    body: 'Pro (€9 a month or €90 a year) shows your full history and adds the forecast, milestone goals, benchmark comparisons, and Excel and PDF exports.',
    plan: 'pro',
  },
];
