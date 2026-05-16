import { describe, it, expect, beforeEach } from 'vitest';
import { captureAttribution, getAttribution, clearAttribution } from '../analytics';

const STORAGE_KEY = 'quantive_utm';

describe('analytics attribution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('captures all UTM params from the URL search string', () => {
    captureAttribution('?utm_source=reddit&utm_medium=organic&utm_campaign=r-privacy&utm_term=encryption&utm_content=top');
    const stored = getAttribution();
    expect(stored.utm_source).toBe('reddit');
    expect(stored.utm_medium).toBe('organic');
    expect(stored.utm_campaign).toBe('r-privacy');
    expect(stored.utm_term).toBe('encryption');
    expect(stored.utm_content).toBe('top');
    expect(stored.utm_captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('captures only the UTM keys that are present in the URL', () => {
    captureAttribution('?utm_source=hn&utm_campaign=launch');
    const stored = getAttribution();
    expect(stored.utm_source).toBe('hn');
    expect(stored.utm_campaign).toBe('launch');
    expect(stored.utm_medium).toBeUndefined();
    expect(stored.utm_term).toBeUndefined();
    expect(stored.utm_content).toBeUndefined();
  });

  it('does not write attribution when the URL has no UTM params', () => {
    captureAttribution('?ref=external&foo=bar');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getAttribution()).toEqual({});
  });

  it('preserves existing attribution when a later visit has no UTM params', () => {
    captureAttribution('?utm_source=mastodon&utm_campaign=launch');
    captureAttribution('');
    const stored = getAttribution();
    expect(stored.utm_source).toBe('mastodon');
    expect(stored.utm_campaign).toBe('launch');
  });

  it('overwrites attribution when a later visit carries new UTM params (last-touch wins)', () => {
    captureAttribution('?utm_source=reddit&utm_campaign=r-privacy');
    captureAttribution('?utm_source=twitter&utm_campaign=launch');
    const stored = getAttribution();
    expect(stored.utm_source).toBe('twitter');
    expect(stored.utm_campaign).toBe('launch');
  });

  it('clearAttribution removes the stored value', () => {
    captureAttribution('?utm_source=indiehackers');
    expect(getAttribution().utm_source).toBe('indiehackers');
    clearAttribution();
    expect(getAttribution()).toEqual({});
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('getAttribution returns an empty object when storage is empty or corrupt', () => {
    expect(getAttribution()).toEqual({});
    localStorage.setItem(STORAGE_KEY, 'not valid json');
    expect(getAttribution()).toEqual({});
    localStorage.setItem(STORAGE_KEY, 'null');
    expect(getAttribution()).toEqual({});
  });

  it('ignores non-UTM query parameters', () => {
    captureAttribution('?utm_source=reddit&foo=bar&session_id=abc');
    const stored = getAttribution();
    expect(stored.utm_source).toBe('reddit');
    expect((stored as Record<string, unknown>).foo).toBeUndefined();
    expect((stored as Record<string, unknown>).session_id).toBeUndefined();
  });
});
