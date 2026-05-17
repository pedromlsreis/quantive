import React from 'react';

export type NoticeVariant = 'warning' | 'accent' | 'negative';

interface NoticeProps {
  variant: NoticeVariant;
  /**
   * Semantic role for screen readers.
   *   - 'status' (default for warning/negative): announces on mount via aria-live="polite".
   *   - 'note': static informational content, no announcement.
   *   - 'region': landmark with aria-label.
   *   - 'alert': assertive announcement; reserve for blocking errors.
   */
  role?: 'status' | 'note' | 'region' | 'alert';
  /** Override the default aria-live for the chosen role. */
  ariaLive?: 'polite' | 'off' | 'assertive';
  /** Required when role='region'. */
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * Single source of truth for the notice/banner/inline-hint family. Applies
 * variant-specific tint + border + foreground colour using the codebase's
 * semantic tokens, and lets callers control padding/layout via children +
 * className. Replaces several near-duplicate ad-hoc styles that drifted
 * apart over earlier fixes.
 *
 * Default visual scale matches the EmailConfirmationBanner / inline notice
 * pattern: 10% tint background, 28% tinted border. Override via style if
 * you need a fuller-bleed banner (e.g. no border) or a different padding.
 */
export function Notice({
  variant,
  role = 'note',
  ariaLive,
  ariaLabel,
  className,
  style,
  children,
}: NoticeProps) {
  const tokens = variantTokens(variant);
  const computedAriaLive = ariaLive ?? (role === 'status' ? 'polite' : undefined);

  return (
    <div
      role={role}
      aria-live={computedAriaLive}
      aria-label={ariaLabel}
      className={className}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--s-2)',
        borderRadius: 'var(--r-2)',
        border: `1px solid ${tokens.border}`,
        background: tokens.background,
        padding: 'var(--s-2) var(--s-3)',
        fontSize: 'var(--text-xs)',
        color: tokens.foreground,
        lineHeight: 1.5,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function variantTokens(variant: NoticeVariant) {
  switch (variant) {
    case 'warning':
      return {
        background: 'color-mix(in oklch, var(--warning) 10%, transparent)',
        border: 'color-mix(in oklch, var(--warning) 30%, transparent)',
        foreground: 'var(--warning)',
      };
    case 'accent':
      return {
        background: 'var(--accent-faint-raw)',
        border: 'color-mix(in oklch, var(--accent-raw) 25%, transparent)',
        foreground: 'var(--accent-raw)',
      };
    case 'negative':
      return {
        background: 'color-mix(in oklch, var(--negative) 10%, transparent)',
        border: 'color-mix(in oklch, var(--negative) 40%, transparent)',
        foreground: 'var(--negative)',
      };
  }
}
