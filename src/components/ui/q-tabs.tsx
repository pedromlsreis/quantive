import { useLayoutEffect, useRef, useState } from 'react';

interface QTabOption<T extends string> {
  value: T;
  label: string;
}

interface QTabsProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: QTabOption<T>[];
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

export function QTabs<T extends string>({ value, onChange, options, size = 'md', ariaLabel }: QTabsProps<T>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ x: 0, w: 0, ready: false });

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const el = wrap.querySelector<HTMLElement>(`[data-tab="${value}"]`);
    if (!el) return;
    const wrapRect = wrap.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setInd({ x: r.left - wrapRect.left, w: r.width, ready: true });
  }, [value, options.length]);

  return (
    <div className={`q-tabs q-tabs--${size}`} ref={wrapRef} role="tablist" aria-label={ariaLabel}>
      <div
        className="q-tab-indicator"
        style={{
          transform: `translateX(${ind.x}px)`,
          width: ind.w,
          opacity: ind.ready ? 1 : 0,
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          data-tab={o.value}
          className={`q-tab${o.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
