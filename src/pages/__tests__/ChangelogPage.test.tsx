import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The nav reaches into the auth and auth-modal contexts; the page under test doesn't.
vi.mock('@/components/landing/StickyNav', () => ({ StickyNav: () => null }));
// Signed out: the changelog is public, so its feedback form must work for guests.
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import ChangelogPage from '../ChangelogPage';
import { CHANGELOG } from '@/content/changelog';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/changelog']}>
      <ChangelogPage />
    </MemoryRouter>,
  );
}

describe('ChangelogPage', () => {
  // Value: protects=dates read like the rest of the product ("30 Sep", never ICU's en-GB "Sept") and stay on their own calendar day;
  // fails_when=the page goes back to Intl's short month, or a timezone shift moves an entry to the day before;
  // why_new=the other test checks tags and grouping, not the visible day; seam=none; no_claim=checks one September and one October entry
  it('shows each entry on its own day in the product date style', () => {
    renderPage();
    expect(document.querySelector('#what-moved time')).toHaveTextContent(/^30 Sep$/);
    expect(document.querySelector('#change-sign-in-email time')).toHaveTextContent(/^20 Oct$/);
  });

  // Value: protects=each entry shows exactly its own tags (Security, Pro/Family, Prompted by feedback), one section per month, each linked from the month nav;
  // fails_when=a flag check, plan label or the month grouping changes: a security fix loses its tag, a month repeats, or a month link points nowhere;
  // why_new=the E2E checks one entry's feedback line and one month heading; nothing covers the Security/plan tags, repeated months or the month nav;
  // seam=none; no_claim=does not check layout, the visible day format, or scrolling to an anchor
  it('renders every entry with exactly its own tags, one section per month, each linked from the month nav', () => {
    renderPage();

    // By id rather than getByRole per entry: a role query rescans the whole page each time, too slow under jsdom.
    for (const entry of CHANGELOG) {
      const article = document.getElementById(entry.id)!;
      expect(article.tagName).toBe('ARTICLE');
      expect(article).toHaveAccessibleName(entry.title);
      expect(article.querySelector('time')).toHaveAttribute('datetime', entry.date);
      const tag = (text: string) => within(article).queryByText(text, { exact: true });
      expect(tag('Security') !== null).toBe(entry.security === true);
      expect(tag('Pro') !== null).toBe(entry.plan === 'pro');
      expect(tag('Family') !== null).toBe(entry.plan === 'family');
      expect(tag('Prompted by feedback') !== null).toBe(entry.feedback === true);
    }

    // One section per calendar month, newest first, holding only that month's entries.
    const months = [...new Set(CHANGELOG.map((e) => e.date.slice(0, 7)))];
    const sections = screen.getAllByRole('region');
    expect(sections).toHaveLength(months.length);
    sections.forEach((section, i) => {
      const dates = [...section.querySelectorAll('article time')].map((t) => t.getAttribute('datetime')?.slice(0, 7));
      expect(dates.length).toBeGreaterThan(0);
      expect(new Set(dates)).toEqual(new Set([months[i]]));
    });

    // The month nav lists those sections in order, and each link lands on its section's heading.
    const links = within(screen.getByRole('navigation', { name: 'Months' })).getAllByRole('link');
    expect(links).toHaveLength(sections.length);
    links.forEach((link, i) => {
      const target = document.getElementById(link.getAttribute('href')!.slice(1));
      expect(target?.tagName).toBe('H2');
      expect(target).toHaveTextContent(link.textContent!);
      expect(sections[i]).toContainElement(target);
    });
  });

  // Value: protects=a signed-out visitor can open the feedback form from the changelog's "Send feedback" button;
  // fails_when=the button stops opening the dialog, or the dialog is dropped from the page or no longer renders for guests;
  // why_new=no test presses this button, and FeedbackDialog has no test of its own;
  // seam=none; no_claim=does not submit feedback or exercise the submit-feedback function
  it('opens the feedback form for a signed-out visitor from "Send feedback"', () => {
    renderPage();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

    const dialog = screen.getByRole('dialog', { name: 'Send feedback' });
    expect(within(dialog).getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
  });
});
