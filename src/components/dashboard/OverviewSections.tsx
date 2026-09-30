import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useFormat } from '@/hooks/useFormat';
import { useSourceColors } from '@/hooks/useSourceColors';
import { useHistoryFloor } from '@/hooks/useHistoryFloor';
import { formatDate, formatDateShort } from '@/lib/formatters';
import { whatMoved, yearByYear } from '@/lib/dashboardData';
import { OTHER_COLOR } from '@/lib/sourceColors';

const TOP = 5;

/** Sources that changed between the last two entries, largest first. */
export function WhatMoved() {
  const { allSnapshots, data } = usePortfolio();
  const f = useFormat();
  const finite = allSnapshots.filter((s) => Number.isFinite(s.total));
  const latest = finite[finite.length - 1];
  const previous = finite[finite.length - 2];
  const result = useMemo(
    () => (latest && previous ? whatMoved(previous, latest, data?.facts ?? []) : null),
    [latest, previous, data],
  );
  if (!result || !latest || !previous) return null;

  const shown = result.moved.slice(0, TOP);
  const moreMoved = result.moved.length - shown.length;

  return (
    <section className="q-sec" aria-labelledby="moved-title">
      <div className="q-sec-head">
        <div>
          <h2 className="q-h2" id="moved-title">What moved</h2>
          <div className="q-sec-sub">{formatDateShort(previous.date, latest.date)} to {formatDate(latest.date)}</div>
        </div>
      </div>
      {shown.length ? (
        <ul className="q-rows">
          {shown.map((m) => (
            <li key={m.name} className="q-row">
              <span className="q-row-name">
                {m.name}
                {m.fxOnly && <span className="q-row-sub">Exchange rate only</span>}
              </span>
              <span className="q-row-val num">{f.money(m.now)}</span>
              <span className={`q-row-val num q-tone-${f.tone(m.change)}`} style={{ minWidth: '9ch' }}>
                {f.money(m.change, { signed: true })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="q-body">Nothing changed since the previous entry.</p>
      )}
      {(moreMoved > 0 || result.unchanged > 0) && (
        <div className="q-row-foot">
          {[
            moreMoved > 0 ? `${moreMoved} more ${moreMoved === 1 ? 'source' : 'sources'} changed` : '',
            result.unchanged > 0 ? `${result.unchanged} ${result.unchanged === 1 ? 'source' : 'sources'} unchanged` : '',
          ].filter(Boolean).join(', ')}
        </div>
      )}
    </section>
  );
}

/** Ranked holdings at the latest entry; the bar is the source's colour. */
export function AllocationSummary() {
  const { allSnapshots } = usePortfolio();
  const f = useFormat();
  const colorOf = useSourceColors();
  const latest = allSnapshots[allSnapshots.length - 1];
  if (!latest) return null;

  const assets = latest.sources.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const gross = assets.reduce((sum, s) => sum + s.value, 0);
  if (!gross) return null;
  // A single leftover source is shown by name: "Other, 1 source" hides it for nothing.
  const top = assets.slice(0, assets.length === TOP + 1 ? TOP + 1 : TOP);
  const rest = assets.slice(top.length);
  const rows = [
    ...top.map((s) => ({ name: s.name, value: s.value, color: colorOf(s.name) })),
    ...(rest.length
      ? [{ name: `Other, ${rest.length} ${rest.length === 1 ? 'source' : 'sources'}`, value: rest.reduce((a, s) => a + s.value, 0), color: OTHER_COLOR }]
      : []),
  ];

  return (
    <section className="q-sec" id="allocation" aria-labelledby="alloc-title">
      <div className="q-sec-head">
        <h2 className="q-h2" id="alloc-title">Allocation</h2>
        <Link to="/allocations" className="q-link-btn" style={{ fontSize: 13 }}>All allocations</Link>
      </div>
      <ul className="q-rows">
        {rows.map((r) => {
          const share = (r.value / gross) * 100;
          return (
            <li key={r.name} className="q-row">
              <span className="q-row-name">{r.name}</span>
              <span className="q-row-val num">{f.money(r.value)}</span>
              <span className="q-row-val q-row-val--muted num">{f.pct(share)}</span>
              <span className="q-bar" aria-hidden="true" style={{ width: `${Math.max(1, share)}%`, background: r.color }} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Calendar years: start, end and change, newest first. */
export function YearByYear() {
  const { allSnapshots } = usePortfolio();
  const floor = useHistoryFloor();
  const f = useFormat();
  const rows = useMemo(
    () => yearByYear(floor ? allSnapshots.filter((s) => s.date >= floor) : allSnapshots),
    [allSnapshots, floor],
  );
  if (!rows.length) return null;

  const span = (r: (typeof rows)[number]) =>
    r.from ? `from ${formatDateShort(r.from, new Date(r.year, 0, 1))}` : r.to ? `to ${formatDateShort(r.to, new Date(r.year, 0, 1))}` : '';

  return (
    <section className="q-sec" aria-labelledby="years-title">
      <div className="q-sec-head"><h2 className="q-h2" id="years-title">Year by year</h2></div>
      {/* The rule spans the page like every section; the table stays at reading width. */}
      <table className="q-table q-table--responsive" style={{ maxWidth: 760 }}>
        <caption className="sr-only">Net worth at the start and end of each calendar year, newest first</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col" className="num" data-col="secondary">Start</th>
            <th scope="col" className="num">End</th>
            <th scope="col" className="num">Change</th>
            <th scope="col" className="num">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <td>
                {r.year}
                {span(r) && <span className="q-table-sub">{span(r)}</span>}
              </td>
              <td className="num" data-col="secondary" style={{ color: 'var(--fg-muted)' }}>{f.money(r.start)}</td>
              <td className="num">{f.money(r.end)}</td>
              <td className={`num q-tone-${f.tone(r.change)}`}>{f.money(r.change, { signed: true })}</td>
              <td className="num" style={{ color: 'var(--fg-muted)' }}>{r.changePct == null ? '—' : f.pct(r.changePct, { signed: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
