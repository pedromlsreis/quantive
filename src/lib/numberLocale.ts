/** Settings number-format choice → the locale numbers are written in; `auto` defers to the browser. */
export type NumberFormat = 'auto' | 'us' | 'eu' | 'space' | 'in';

export const NUMBER_FORMAT_LOCALES: Record<NumberFormat, string | undefined> = {
  auto: undefined,
  us: 'en-US',
  eu: 'de-DE',
  space: 'fr-FR',
  in: 'en-IN',
};
