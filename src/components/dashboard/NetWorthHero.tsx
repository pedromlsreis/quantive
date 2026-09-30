import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useFormat } from '@/hooks/useFormat';
import { formatDate, formatDateShort, moneyParts } from '@/lib/formatters';
import { latestChange, changeOverYear } from '@/lib/dashboardData';
import { historicalPace, generateScenarioForecast, projectionHistory } from '@/lib/scenarioForecast';
import { RollText } from './RollText';
import { Delta } from './Delta';
import { SNAPSHOT_SAVED_EVENT, canAnimate } from '@/lib/appEvents';

/**
 * Net worth now, the change since the previous entry, and three supporting
 * figures. The one real total on the page, so the only double rule.
 */
export function NetWorthHero() {
  const { allSnapshots } = usePortfolio();
  const f = useFormat();
  const figRef = useRef<HTMLDivElement>(null);

  const entry = useMemo(() => latestChange(allSnapshots), [allSnapshots]);
  const year = useMemo(() => changeOverYear(allSnapshots), [allSnapshots]);
  // Same history and function as /forecast, so both show the same projection.
  const history = useMemo(() => projectionHistory(allSnapshots), [allSnapshots]);
  const pace = useMemo(() => historicalPace(history), [history]);
  const inFiveYears = useMemo(
    () => (pace ? generateScenarioForecast(history, 60, pace.rate).at(-1)?.forecast ?? null : null),
    [history, pace],
  );

  const total = entry?.latest.total ?? 0;
  const parts = moneyParts(total, f.ctx);
  const deltaText = entry?.previous
    ? `${f.money(entry.change, { signed: true })} (${f.pct(entry.changePct ?? 0, { signed: true })})`
    : '';

  // The saved-month moment: after the composer saves the latest entry, the
  // characters that changed swap in once. Everything else about the figure is
  // static, and the roll never runs on load, currency switch or unlock.
  const armed = useRef(false);
  const shown = useRef({ number: parts.number, delta: deltaText });
  const [roll, setRoll] = useState<{ number: string; delta: string } | null>(null);
  // The one live region for a save made here; the composer toasts elsewhere.
  const [announce, setAnnounce] = useState('');

  // What a save announces, kept current for the handlers below.
  const savedText = useRef('');
  savedText.current = !entry
    ? ''
    : `Saved. Net worth ${f.money(total)}${
        entry.previous
          ? `, ${f.tone(entry.change) === 'zero' ? 'no change' : f.money(entry.change, { signed: true })} since ${formatDateShort(entry.previous.date, entry.latest.date)}`
          : ''
      }.`;

  useEffect(() => {
    const arm = () => {
      armed.current = true;
      // A save that changes nothing on screen never reaches the layout effect;
      // disarm once its render has committed so a later currency switch can't roll.
      window.setTimeout(() => {
        if (!armed.current) return;
        armed.current = false;
        setAnnounce(savedText.current);
      }, 0);
    };
    window.addEventListener(SNAPSHOT_SAVED_EVENT, arm);
    return () => window.removeEventListener(SNAPSHOT_SAVED_EVENT, arm);
  }, []);

  useLayoutEffect(() => {
    const before = shown.current;
    shown.current = { number: parts.number, delta: deltaText };
    if (!armed.current) return;
    armed.current = false;
    setAnnounce(savedText.current);
    if (before.number !== parts.number && canAnimate(figRef.current)) setRoll(before);
  }, [parts.number, deltaText]);

  // Read once, then cleared, so browsing later never lands on a stale total.
  useEffect(() => {
    if (!announce) return;
    const t = window.setTimeout(() => setAnnounce(''), 5000);
    return () => window.clearTimeout(t);
  }, [announce]);

  useEffect(() => {
    if (!roll) return;
    const end = () => setRoll(null);
    const t = window.setTimeout(end, 800);
    window.addEventListener('pointerdown', end, { once: true });
    window.addEventListener('keydown', end, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', end);
      window.removeEventListener('keydown', end);
    };
  }, [roll]);

  if (!entry) return null;

  const liquid = entry.latest.sources.filter((s) => s.isLiquid).reduce((sum, s) => sum + s.value, 0);
  const gross = entry.latest.sources.filter((s) => s.value > 0).reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="q-hero">
      <div ref={figRef}>
        <div className="q-hero-label">Net worth</div>
        <div style={{ display: 'inline-block' }}>
          <div className="q-fig q-fig--hero q-metric-value num">
            {parts.sign}
            {parts.before && <span className="q-fig-unit">{parts.before}</span>}
            <RollText text={parts.number} from={roll?.number} />
            {parts.after && <span className="q-fig-unit">{parts.after}</span>}
          </div>
          <div className="q-double-rule" aria-hidden="true" />
        </div>
        <div className="q-hero-delta">
          {entry.previous ? (
            <>
              <span className={`q-delta q-delta--${f.tone(entry.change)}`}>
                {f.tone(entry.change) !== 'zero' && <span className="q-delta-mark" aria-hidden="true" />}
                <span className="num">
                  <RollText text={deltaText} from={roll?.delta} className="q-roll--late" />
                </span>
              </span>
              <span className="q-hero-delta-when">since {formatDateShort(entry.previous.date, entry.latest.date)}</span>
            </>
          ) : (
            <span className="q-hero-delta-when">First entry, {formatDate(entry.latest.date)}</span>
          )}
        </div>
      </div>

      <p className="sr-only" role="status">{announce}</p>

      <dl className="q-ledger">
        {year && (
          <div className="q-ledger-row">
            <dt>{year.fullYear ? '12-month change' : `Change since ${formatDate(year.from.date)}`}</dt>
            <dd>
              <Delta text={f.money(year.change, { signed: true })} tone={f.tone(year.change)} />
              {year.changePct != null && <span className="q-ledger-sub">{f.pct(year.changePct, { signed: true })}</span>}
            </dd>
          </div>
        )}
        <div className="q-ledger-row">
          <dt>Liquid</dt>
          <dd>
            <span className="q-ledger-val num">{f.money(liquid)}</span>
            {gross > 0 && <span className="q-ledger-sub">{f.pct((liquid / gross) * 100)} of assets</span>}
          </dd>
        </div>
        {pace && inFiveYears != null && (
          <div className="q-ledger-row">
            <dt>In 5 years at your pace</dt>
            <dd>
              <Link to="/forecast" className="q-ledger-val num" style={{ textDecoration: 'none' }}>
                {f.money(inFiveYears, { compact: true })}
              </Link>
              <span className="q-ledger-sub">{f.pct(pace.rate * 100)} a year</span>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
