import type { HtmlTagDescriptor, Plugin } from 'vite';

// Fonts the first viewport of the public pages paints with: the Fraunces
// cover H1 (desktop LCP) and Geist 400 body text (the mobile LCP is the hero
// paragraph). Without a preload the browser only discovers them after the
// main CSS has downloaded and parsed.
export const PRELOADED_FONTS: readonly RegExp[] = [
  /(^|\/)fraunces-latin-standard-normal-[\w-]+\.woff2$/,
  /(^|\/)geist-latin-400-normal-[\w-]+\.woff2$/,
];

/** Preload tags for the emitted font assets matching `PRELOADED_FONTS`. */
export function fontPreloadTags(fileNames: Iterable<string>, base: string): HtmlTagDescriptor[] {
  const names = [...fileNames];
  return PRELOADED_FONTS.flatMap((pattern) => {
    const fileName = names.find((name) => pattern.test(name));
    if (!fileName) return [];
    return [{
      tag: 'link',
      // Fonts are fetched in CORS mode, so the preload needs `crossorigin`
      // even on the same origin, or the browser downloads the file twice.
      attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `${base}${fileName}`, crossorigin: true },
      injectTo: 'head',
    }];
  });
}

/**
 * Injects `<link rel="preload">` for the hashed font files into index.html at
 * build time. The per-route copies (seo-route-html) and the prerendered pages
 * are derived from index.html, so they inherit the tags.
 */
export function fontPreload(): Plugin {
  let base = '/';
  return {
    name: 'font-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return [];
        const tags = fontPreloadTags(Object.keys(ctx.bundle), base);
        if (tags.length !== PRELOADED_FONTS.length) {
          // A renamed @fontsource file would otherwise drop the preload silently.
          console.warn(`font-preload: matched ${tags.length} of ${PRELOADED_FONTS.length} fonts`);
        }
        return tags;
      },
    },
  };
}
