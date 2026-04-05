/**
 * @module chartColors
 * Centralised colour palette for Recharts visualisations.
 * All values are HSL strings for consistency with the Tailwind design system.
 */

/** Primary palette for line/area/pie charts — high-contrast, 10 colours. */
export const CHART_COLORS: readonly string[] = [
  'hsl(186, 72%, 48%)',
  'hsl(210, 70%, 55%)',
  'hsl(152, 60%, 48%)',
  'hsl(38, 80%, 55%)',
  'hsl(340, 65%, 55%)',
  'hsl(260, 60%, 58%)',
  'hsl(170, 55%, 45%)',
  'hsl(25, 75%, 55%)',
  'hsl(300, 45%, 50%)',
  'hsl(195, 65%, 50%)',
];

/** Muted, neutral palette for treemap visualisations. */
export const TREEMAP_COLORS: readonly string[] = [
  'hsl(210, 15%, 35%)',
  'hsl(200, 18%, 42%)',
  'hsl(220, 12%, 48%)',
  'hsl(195, 14%, 38%)',
  'hsl(215, 10%, 52%)',
  'hsl(205, 16%, 30%)',
  'hsl(190, 12%, 45%)',
  'hsl(225, 10%, 40%)',
  'hsl(200, 8%, 55%)',
  'hsl(210, 12%, 33%)',
];

/** Primary accent colour used for main chart lines and highlights. */
export const PRIMARY_COLOR = 'hsl(186, 72%, 48%)';
/** Colour for positive changes / gains. */
export const POSITIVE_COLOR = 'hsl(152, 58%, 46%)';
/** Colour for negative changes / losses. */
export const NEGATIVE_COLOR = 'hsl(0, 72%, 55%)';
/** Grid line colour for chart backgrounds. */
export const GRID_COLOR = 'hsl(222, 20%, 14%)';
/** Axis label/tick colour. */
export const AXIS_COLOR = 'hsl(220, 12%, 45%)';
/** Tooltip background colour. */
export const TOOLTIP_BG = 'hsl(222, 25%, 10%)';
/** Tooltip border colour. */
export const TOOLTIP_BORDER = 'hsl(222, 20%, 18%)';
