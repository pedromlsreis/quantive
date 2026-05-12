interface BrandProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Monogram({ size = 20, className = '', style = {} }: BrandProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <line x1="14.2" y1="14.2" x2="20.5" y2="20.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ size = 22, className = '', style = {} }: BrandProps) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}
    >
      <Monogram size={size} style={{ color: 'var(--accent-raw)' }} />
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: Math.round(size * 0.85),
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: 'var(--fg)',
          lineHeight: 1,
        }}
      >
        quantive
      </span>
    </span>
  );
}
