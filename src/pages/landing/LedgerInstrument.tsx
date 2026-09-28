import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { RollingFigure } from '@/components/landing/RollingFigure';
import { analytics } from '@/lib/analytics';
import {
  CHART_H,
  CHART_W,
  DISPLAY_CURRENCIES,
  FORECAST_MONTHS,
  LAST_MONTH,
  RESTING_MONTH,
  X_MAX,
  buildInstrument,
  compactMoney,
  money,
  relativeMonth,
  signedMoney,
  xOf,
  yOf,
  yTicks,
  type DisplayCurrency,
  type Instrument,
} from './instrumentData';

const HISTORY_SLOTS = LAST_MONTH + 1;
const CONE_SLOTS = FORECAST_MONTHS + 1;

/**
 * Flattens one state into a fixed-length coordinate vector (history padded to
 * the last month, then the cone's centre, upper and lower edges), so any two
 * states can be tweened point by point without the path popping.
 */
function toVector(inst: Instrument): number[] {
  const v: number[] = [];
  const c = inst.currency;
  for (let i = 0; i < HISTORY_SLOTS; i++) {
    const p = inst.history[Math.min(i, inst.history.length - 1)];
    v.push(xOf(p.month), yOf(p.value, c));
  }
  const last = inst.history[inst.history.length - 1];
  const edge = (key: 'forecast' | 'upper' | 'lower') => {
    v.push(xOf(last.month), yOf(last.value, c));
    for (const f of inst.forecast) v.push(xOf(f.month), yOf(f[key], c));
  };
  edge('forecast');
  edge('upper');
  edge('lower');
  return v;
}

function slice(v: number[], from: number, count: number) {
  const pts: string[] = [];
  for (let i = 0; i < count; i++) pts.push(`${v[(from + i) * 2].toFixed(2)},${v[(from + i) * 2 + 1].toFixed(2)}`);
  return pts;
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Tweens the chart vector toward its target; instant when motion is off.
 * While the plot is out of view (`ready` false) it holds the old shape and
 * catches up once the visitor can see it.
 */
function useTweenedVector(target: number[], motion: boolean, delayMs: number, ready: boolean) {
  const [current, setCurrent] = useState(target);
  const currentRef = useRef(target);
  useEffect(() => {
    const from = currentRef.current;
    if (!motion) {
      currentRef.current = target;
      setCurrent(target);
      return;
    }
    if (!ready) return;
    let raf = 0;
    const timer = window.setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const k = easeOut(Math.min(1, (now - start) / 480));
        const next = target.map((to, i) => from[i] + (to - from[i]) * k);
        currentRef.current = next;
        setCurrent(next);
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, motion, delayMs, ready]);
  return current;
}

interface LedgerInstrumentProps {
  currency: DisplayCurrency;
  onCurrencyChange: (c: DisplayCurrency) => void;
  /** Latest month shown; owned by the page so the privacy figure agrees. */
  month: number;
  onMonthChange: (m: number) => void;
  motion: boolean;
}

export function LedgerInstrument({ currency, onCurrencyChange, month, onMonthChange, motion }: LedgerInstrumentProps) {
  const [scrub, setScrub] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const [chartDelay, setChartDelay] = useState(0);
  const [plotSeen, setPlotSeen] = useState(false);
  // Set when input interrupts the arrival: the final state appears without a roll.
  const [settled, setSettled] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  const inst = useMemo(() => buildInstrument(month, currency), [month, currency]);
  const target = useMemo(() => toVector(inst), [inst]);
  // An interrupted arrival shows its end state at once, chart included.
  const vec = useTweenedVector(target, motion && !settled, chartDelay, plotSeen);

  useEffect(() => {
    const el = plotRef.current;
    if (!motion || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setPlotSeen(true);
        io.disconnect();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [motion]);

  // The one unprompted sequence: the month after the resting state arrives,
  // once, when the instrument is at least half in view. It never runs for
  // reduced motion, automation or a visitor who has already touched it.
  useEffect(() => {
    const el = rootRef.current;
    if (!motion || !el || month !== RESTING_MONTH || typeof IntersectionObserver === 'undefined') return;
    let timer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || touched.current || document.visibilityState !== 'visible') return;
        io.disconnect();
        document.fonts.ready.then(() => {
          timer = window.setTimeout(() => {
            if (touched.current) return;
            setChartDelay(480);
            onMonthChange(LAST_MONTH);
          }, 400);
        });
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [motion, month, onMonthChange]);

  const markTouched = () => {
    if (touched.current) return;
    touched.current = true;
    // Input before or during the arrival jumps straight to its final state.
    if (motion && (month === RESTING_MONTH || chartDelay > 0)) {
      setSettled(true);
      setChartDelay(0);
      onMonthChange(LAST_MONTH);
    }
  };

  const selectCurrency = (c: DisplayCurrency, focus = false) => {
    markTouched();
    setSettled(false);
    setChartDelay(0);
    onCurrencyChange(c);
    const next = buildInstrument(month, c);
    setAnnounce(`Showing values in ${c}. Net worth ${money(next.total, c)}.`);
    if (focus) radios.current[DISPLAY_CURRENCIES.indexOf(c)]?.focus();
  };

  const onRadioKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = DISPLAY_CURRENCIES.length;
    selectCurrency(DISPLAY_CURRENCIES[(i + dir + n) % n], true);
  };

  // ── Scrub ──────────────────────────────────────────────────────────────
  const maxIndex = inst.latest + FORECAST_MONTHS;
  const index = scrub ?? inst.latest;
  const rect = useRef<DOMRect | null>(null);
  const pending = useRef<number | null>(null);

  const indexFromX = useCallback(
    (clientX: number) => {
      const r = rect.current ?? plotRef.current?.getBoundingClientRect();
      if (!r) return inst.latest;
      const m = Math.round(((clientX - r.left) / r.width) * X_MAX);
      return Math.max(0, Math.min(maxIndex, m));
    },
    [inst.latest, maxIndex],
  );

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const next = indexFromX(e.clientX);
    if (pending.current !== null) {
      pending.current = next;
      return;
    }
    pending.current = next;
    requestAnimationFrame(() => {
      setScrub(pending.current);
      pending.current = null;
    });
  };

  const onPlotKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1, PageDown: -12, PageUp: 12 };
    let next: number | null = null;
    if (e.key in step) next = index + step[e.key];
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = inst.latest;
    if (next === null) return;
    e.preventDefault();
    markTouched();
    setScrub(Math.max(0, Math.min(maxIndex, next)));
  };

  const readout = useMemo(() => {
    if (index <= inst.latest) {
      const p = inst.history[index];
      return { when: relativeMonth(index, inst.latest), value: money(p.value, currency), range: '' };
    }
    const f = inst.forecast[index - inst.latest - 1];
    return {
      when: relativeMonth(index, inst.latest),
      value: money(f.forecast, currency),
      range: `95% range ${compactMoney(f.lower, currency)} to ${compactMoney(f.upper, currency)}`,
    };
  }, [index, inst, currency]);

  // ── Geometry from the tweened vector ────────────────────────────────────
  const history = slice(vec, 0, HISTORY_SLOTS);
  const centre = slice(vec, HISTORY_SLOTS, CONE_SLOTS);
  const upper = slice(vec, HISTORY_SLOTS + CONE_SLOTS, CONE_SLOTS);
  const lower = slice(vec, HISTORY_SLOTS + CONE_SLOTS * 2, CONE_SLOTS);
  const band = [...upper, ...lower.slice().reverse()].join(' ');
  // At rest the marker rides the tweened line tip, so it never runs ahead of the line.
  const tipX = vec[(HISTORY_SLOTS - 1) * 2];
  const tipY = vec[(HISTORY_SLOTS - 1) * 2 + 1];
  const cursorX = scrub === null ? tipX : xOf(index);
  const cursorY =
    scrub === null
      ? tipY
      : index <= inst.latest
        ? yOf(inst.history[index].value, currency)
        : yOf(inst.forecast[index - inst.latest - 1].forecast, currency);
  const ticks = yTicks(currency);
  const xLabels = [36, 24, 12].map((back) => ({
    month: inst.latest - back,
    label: relativeMonth(inst.latest - back, inst.latest),
    short: `${back / 12}y ago`,
  }));

  return (
    <figure
      ref={rootRef}
      className="lp-inst"
      data-settled={settled ? '' : undefined}
      onPointerDown={markTouched}
      onKeyDown={markTouched}
      onFocus={markTouched}
    >
      <div className="lp-inst-head">
        <p className="pub-label" id="lp-inst-title">Illustrative portfolio</p>
        <div className="lp-inst-ccy" role="radiogroup" aria-label="Display currency">
          <span className="lp-inst-ccy-label" aria-hidden="true">Show in</span>
          {DISPLAY_CURRENCIES.map((c, i) => (
            <button
              key={c}
              ref={(el) => (radios.current[i] = el)}
              type="button"
              role="radio"
              aria-checked={c === currency}
              tabIndex={c === currency ? 0 : -1}
              className="lp-inst-ccy-opt"
              onClick={() => selectCurrency(c)}
              onKeyDown={(e) => onRadioKey(e, i)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <table className="lp-inst-table" aria-labelledby="lp-inst-title">
        <caption className="sr-only">Illustrative portfolio: six holdings in three currencies adding up to one net worth</caption>
        <thead>
          <tr>
            <th scope="col" className="pub-label">Source</th>
            <th scope="col" className="pub-label">Held in</th>
            <th scope="col" className="pub-label lp-inst-num">Value</th>
          </tr>
        </thead>
        <tbody>
          {inst.rows.map((r) => (
            <tr key={r.id}>
              <th scope="row">{r.label}</th>
              <td className="lp-inst-held">{r.heldIn}</td>
              <td className="lp-inst-num">
                <RollingFigure value={money(r.value, currency)} rollMs={480} group={currency} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              Net worth
              <span className="lp-inst-delta">
                <RollingFigure value={signedMoney(inst.delta, currency)} rollMs={240} delayMs={960} group={currency} />{' '}
                this month
              </span>
            </th>
            <td className="lp-inst-num">
              <RollingFigure
                value={money(inst.total, currency)}
                rollMs={480}
                delayMs={240}
                group={currency}
                className="lp-inst-total"
              />
            </td>
          </tr>
        </tfoot>
      </table>
      <div className="pub-double-rule" aria-hidden="true" />

      <div className="lp-inst-chart">
        <div className="lp-inst-yaxis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={`${currency}-${t.value}`} className="lp-inst-tick" style={{ top: `${(t.y / CHART_H) * 100}%` }}>
              {compactMoney(t.value, currency)}
            </span>
          ))}
        </div>
        <div
          ref={plotRef}
          className="lp-inst-plot"
          role="slider"
          tabIndex={0}
          aria-label="Net worth history and forecast"
          aria-valuemin={0}
          aria-valuemax={maxIndex}
          aria-valuenow={index}
          aria-valuetext={`${readout.when}, ${readout.value}${readout.range ? `, ${readout.range}` : ''}`}
          onPointerEnter={() => (rect.current = plotRef.current?.getBoundingClientRect() ?? null)}
          onPointerMove={onPointerMove}
          onPointerLeave={() => {
            rect.current = null;
            setScrub(null);
          }}
          onKeyDown={onPlotKey}
          onBlur={() => setScrub(null)}
        >
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true">
            {ticks.map((t) => (
              <line key={t.value} x1={0} x2={CHART_W} y1={t.y} y2={t.y} className="lp-inst-grid" />
            ))}
            <line x1={tipX} x2={tipX} y1={0} y2={CHART_H} className="lp-inst-now" />
            <polygon points={band} className="lp-inst-band" />
            <polyline points={centre.join(' ')} className="lp-inst-forecast" />
            <polyline points={history.join(' ')} className="lp-inst-line" />
            <g className="lp-inst-cursor" transform={`translate(${cursorX.toFixed(2)} 0)`}>
              <line x1={0} x2={0} y1={0} y2={CHART_H} />
            </g>
          </svg>
          <span
            className="lp-inst-dot"
            aria-hidden="true"
            style={{ left: `${(cursorX / CHART_W) * 100}%`, top: `${(cursorY / CHART_H) * 100}%` }}
          />
          <span className="lp-inst-forecast-label" aria-hidden="true" style={{ left: `${(tipX / CHART_W) * 100}%` }}>
            Forecast
          </span>
        </div>
        <div className="lp-inst-xaxis" aria-hidden="true">
          {xLabels.map((l) => (
            <span key={l.label} style={{ left: `${(xOf(l.month) / CHART_W) * 100}%` }}>
              <span className="is-long">{l.label}</span>
              <span className="is-short">{l.short}</span>
            </span>
          ))}
        </div>
      </div>

      <p className="lp-inst-readout" aria-hidden="true">
        <span>{readout.when}</span>
        <span className="lp-inst-readout-val">{readout.value}</span>
        {readout.range && <span className="lp-inst-readout-range">{readout.range}</span>}
      </p>

      <figcaption className="lp-inst-caption">
        Exchange rates are illustrative. In the app, each month is valued at the reference rate of its own date.{' '}
        <Link
          to="/demo"
          className="pub-link"
          onClick={() => analytics.landingCtaClicked({ cta: 'try_demo', location: 'hero_instrument' })}
        >
          Open the full demo
        </Link>
      </figcaption>
      <p className="sr-only" aria-live="polite">{announce}</p>
    </figure>
  );
}
