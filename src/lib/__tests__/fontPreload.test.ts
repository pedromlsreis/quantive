import { describe, expect, it } from 'vitest';
import { PRELOADED_FONTS, fontPreloadTags } from '../../../vite-plugins/font-preload';

const bundle = [
  'assets/index-B5dN6XSF.js',
  'assets/fraunces-latin-ext-standard-normal-CJcjJNj7.woff2',
  'assets/fraunces-latin-standard-normal-DihXLNYH.woff2',
  'assets/geist-latin-400-normal-B40WzpMT.woff',
  'assets/geist-latin-400-normal-B40WzpMT.woff2',
  'assets/geist-latin-500-normal-CTWBw9NS.woff2',
  'assets/geist-latin-ext-400-normal-CND6cjiG.woff2',
];

describe('font-preload plugin', () => {
  it('preloads only the latin Fraunces and Geist 400 woff2 files, with crossorigin', () => {
    const tags = fontPreloadTags(bundle, '/');
    expect(tags.map((t) => t.attrs?.href)).toEqual([
      '/assets/fraunces-latin-standard-normal-DihXLNYH.woff2',
      '/assets/geist-latin-400-normal-B40WzpMT.woff2',
    ]);
    for (const tag of tags) {
      expect(tag).toMatchObject({
        tag: 'link',
        injectTo: 'head',
        attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: true },
      });
    }
  });

  it('respects a non-root base and skips fonts missing from the bundle', () => {
    const tags = fontPreloadTags(['assets/geist-latin-400-normal-x1.woff2'], '/app/');
    expect(tags.map((t) => t.attrs?.href)).toEqual(['/app/assets/geist-latin-400-normal-x1.woff2']);
    expect(tags.length).toBeLessThan(PRELOADED_FONTS.length);
  });
});
