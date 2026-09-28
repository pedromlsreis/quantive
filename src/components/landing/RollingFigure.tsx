import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface RollingFigureProps {
  value: string;
  className?: string;
  /** Duration of each character's roll, in ms. */
  rollMs?: number;
  /** Extra delay before the roll starts, in ms. */
  delayMs?: number;
  /**
   * Changing the group (e.g. the display currency) rolls the whole figure;
   * a new value in the same group rolls only the characters that changed.
   */
  group?: string;
}

/**
 * A figure whose changed characters roll in while unchanged ones hold still.
 *
 * Until the value first changes it is plain text, so the prerendered HTML,
 * crawlers and screen readers get "€132,365", not one node per digit. After
 * that the readable value sits in an sr-only span and the per-character
 * glyphs are aria-hidden. The roll itself only runs under [data-motion='on'].
 */
export function RollingFigure({ value, className = '', rollMs = 240, delayMs = 0, group = '' }: RollingFigureProps) {
  const committed = useRef<{ value: string; group: string } | null>(null);
  const everChanged = useRef(false);

  const prev = committed.current;
  const changed = everChanged.current || (prev !== null && (prev.value !== value || prev.group !== group));

  useEffect(() => {
    if (changed) everChanged.current = true;
    committed.current = { value, group };
  });

  if (!changed) return <span className={`pub-roll ${className}`}>{value}</span>;

  const chars = Array.from(value);
  const prevChars = prev ? Array.from(prev.value) : [];
  const groupChanged = prev !== null && prev.group !== group;
  return (
    <span className={`pub-roll ${className}`}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">
        {chars.map((ch, i) => {
          const fromRight = chars.length - i;
          const before = prevChars[prevChars.length - fromRight];
          return (
            <RollChar
              key={`${group}:${fromRight}:${ch}`}
              ch={ch}
              fresh={prev !== null && (groupChanged || before !== ch)}
              style={{ '--roll-ms': `${rollMs}ms`, '--roll-delay': `${delayMs + fromRight * 14}ms` } as CSSProperties}
            />
          );
        })}
      </span>
    </span>
  );
}

function RollChar({ ch, fresh, style }: { ch: string; fresh: boolean; style: CSSProperties }) {
  // Decided once at mount, so later re-renders never cut a roll short.
  const [rolls] = useState(fresh);
  return (
    <span className={rolls ? 'pub-roll-ch is-new' : 'pub-roll-ch'} style={rolls ? style : undefined}>
      {ch}
    </span>
  );
}
