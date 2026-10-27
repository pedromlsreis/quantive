import { useState } from 'react';
import { PublicPage } from '@/components/landing/PublicPage';
import { FeedbackDialog } from '@/components/dashboard/FeedbackDialog';
import { usePageMeta } from '@/hooks/usePageMeta';
import { getRouteMeta } from '@/lib/seo/routeMeta';
import { CHANGELOG, type ChangelogEntry } from '@/content/changelog';
import { formatDayMonth } from '@/lib/formatters';
import '@/styles/doc.css';

const COMMITS_URL = 'https://github.com/pedromlsreis/quantive/commits/main';
const PLAN_LABEL = { pro: 'Pro', family: 'Family' } as const;

const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
// An entry's date is a calendar day: built at local midnight, no timezone can move it.
const toDay = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
};

interface Month {
  id: string;
  label: string;
  entries: ChangelogEntry[];
}

// Months with no entries never render: a gap shows as a jump in dates, not an empty heading.
function groupByMonth(entries: readonly ChangelogEntry[]): Month[] {
  const months: Month[] = [];
  for (const entry of entries) {
    const label = monthLabel.format(toDay(entry.date));
    const id = label.toLowerCase().replace(/\s+/g, '-');
    const last = months[months.length - 1];
    if (last?.id === id) last.entries.push(entry);
    else months.push({ id, label, entries: [entry] });
  }
  return months;
}

export default function ChangelogPage() {
  usePageMeta(getRouteMeta('/changelog'));
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const months = groupByMonth(CHANGELOG);

  return (
    <PublicPage>
      <div className="pub-wrap doc">
        <header className="doc-head">
          <h1 className="pub-display">Changelog</h1>
          <p className="pub-lede cl-lede">
            What changed in Quantive since the Pro launch on 20 May 2026, newest first. Built by one person, so changes
            ship in batches.
          </p>
        </header>

        <div className="pub-doc">
          <nav className="pub-doc-toc" aria-label="Months">
            <p className="pub-label">Months</p>
            <ol>
              {months.map((m) => (
                <li key={m.id}>
                  <a href={`#${m.id}`}>{m.label}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="pub-doc-body">
            {months.map((m) => (
              <section key={m.id} className="cl-month" aria-labelledby={m.id}>
                <h2 id={m.id} className="doc-h2">{m.label}</h2>
                <ol className="cl-list">
                  {m.entries.map((entry) => (
                    <li key={entry.id}>
                      <Entry entry={entry} />
                    </li>
                  ))}
                </ol>
              </section>
            ))}

            <p className="pub-fine cl-earlier">
              Earlier changes are in the{' '}
              <a href={COMMITS_URL} className="pub-link" target="_blank" rel="noopener noreferrer">
                commit history on GitHub
              </a>
              .
            </p>
            <p className="cl-next">
              Missing something?{' '}
              <button type="button" className="pub-link cl-link-btn" onClick={() => setFeedbackOpen(true)}>
                Send feedback
              </button>
            </p>
          </div>
        </div>
      </div>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </PublicPage>
  );
}

function Entry({ entry }: { entry: ChangelogEntry }) {
  return (
    <article id={entry.id} className="cl-entry" aria-labelledby={`${entry.id}-title`}>
      <div className="cl-meta">
        <a href={`#${entry.id}`} className="cl-date">
          <time dateTime={entry.date}>{formatDayMonth(toDay(entry.date))}</time>
        </a>
        {entry.security && <span className="q-tag">Security</span>}
        {entry.plan && <span className="q-tag">{PLAN_LABEL[entry.plan]}</span>}
      </div>
      <div className="cl-main">
        <h3 id={`${entry.id}-title`} className="cl-title">{entry.title}</h3>
        <p>{entry.body}</p>
        {entry.feedback && <p className="cl-feedback">Prompted by feedback</p>}
      </div>
    </article>
  );
}
