import { describe, expect, it, vi } from 'vitest';
import { MAX_CONFLICTS, PortfolioSync, type PortfolioSyncDeps, type SyncDoc } from '../portfolioSync';
import type { ExtraPortfolioMeta, SaveOutcome } from '../portfolios';
import type { PortfolioData } from '../types';

const meta: ExtraPortfolioMeta = { id: 'p1', name: 'Joint', ownerId: 'u1', revision: 1, keyEpoch: 1, rotationDue: false };
const day = (d: number) => new Date(2026, 8, d);

function data(...entries: Array<[number, string, number]>): PortfolioData {
  return {
    facts: entries.map(([d, idSource, sourceVl]) => ({ date: day(d), idSource, sourceVl, currency: 'EUR' as const })),
    refSources: [...new Set(entries.map(([, s]) => s))].map((idSource) => ({ idSource, volatType: 'Unknown', transferableInDays: false })),
    goals: [],
  };
}

const values = (d: PortfolioData | null) => (d?.facts ?? []).map((f) => `${f.date.getDate()}:${f.idSource}=${f.sourceVl}`).sort();

/** A server holding one portfolio: saves are a compare-and-swap on revision and epoch. */
function server(initial: SyncDoc) {
  const stored = { doc: initial };
  const saves: Array<{ meta: ExtraPortfolioMeta; data: PortfolioData | null }> = [];
  const save = vi.fn(async (m: ExtraPortfolioMeta, d: PortfolioData | null): Promise<SaveOutcome> => {
    saves.push({ meta: m, data: d });
    if (m.revision !== stored.doc.meta.revision || m.keyEpoch !== stored.doc.meta.keyEpoch) {
      return { status: 'conflict', revision: stored.doc.meta.revision };
    }
    stored.doc = { meta: { ...m, revision: m.revision + 1 }, data: d };
    return { status: 'ok', revision: m.revision + 1 };
  });
  /** Someone else's save lands. */
  const external = (d: PortfolioData | null, name = stored.doc.meta.name) => {
    stored.doc = { meta: { ...stored.doc.meta, name, revision: stored.doc.meta.revision + 1 }, data: d };
  };
  return { stored, saves, save, external };
}

function deps(overrides: Partial<PortfolioSyncDeps> = {}): PortfolioSyncDeps {
  return {
    save: vi.fn(),
    rotate: vi.fn(),
    fetch: vi.fn(),
    onView: vi.fn(),
    onSaved: vi.fn(),
    onState: vi.fn(),
    onDropped: vi.fn(),
    onForbidden: vi.fn(),
    onError: vi.fn(),
    delay: async () => {},
    ...overrides,
  };
}

describe('PortfolioSync', () => {
  it('saves edits in order against the revision each save returned', async () => {
    const srv = server({ meta, data: data([1, 'Savings', 100]) });
    const d = deps({ save: srv.save, fetch: async () => srv.stored.doc });
    const sync = new PortfolioSync(srv.stored.doc, d);

    sync.apply({ type: 'addEntries', date: day(2), entries: [{ name: 'Savings', value: 110, currency: 'EUR' }] });
    sync.apply({ type: 'addEntries', date: day(3), entries: [{ name: 'Savings', value: 120, currency: 'EUR' }] });
    expect(values(sync.doc.data)).toEqual(['1:Savings=100', '2:Savings=110', '3:Savings=120']);

    expect(await sync.flush()).toBe('synced');
    expect(srv.saves.map((s) => s.meta.revision)).toEqual([1, 2]);
    expect(values(srv.stored.doc.data)).toEqual(['1:Savings=100', '2:Savings=110', '3:Savings=120']);
    expect(sync.settled).toBe(true);
    expect(d.onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 3 }));
    expect(d.onState).toHaveBeenLastCalledWith('synced');
  });

  it("replays unsaved edits on top of a partner's save and writes once more", async () => {
    const srv = server({ meta, data: data([1, 'Savings', 100]) });
    const d = deps({ save: srv.save, fetch: async () => srv.stored.doc });
    const sync = new PortfolioSync(srv.stored.doc, d);

    srv.external(data([1, 'Savings', 100], [5, 'Brokerage', 900]));
    sync.apply({ type: 'addEntries', date: day(2), entries: [{ name: 'Savings', value: 110, currency: 'EUR' }] });

    expect(await sync.flush()).toBe('synced');
    expect(srv.saves.map((s) => s.meta.revision)).toEqual([1, 2]);
    expect(values(srv.stored.doc.data)).toEqual(['1:Savings=100', '2:Savings=110', '5:Brokerage=900']);
    expect(values(sync.doc.data)).toEqual(values(srv.stored.doc.data));
    expect(d.onView).toHaveBeenCalledTimes(1);
    expect(d.onDropped).not.toHaveBeenCalled();
  });

  it('drops edits that no longer apply after a replay and reports them', async () => {
    const srv = server({ meta, data: data([1, 'Savings', 100]) });
    const d = deps({ save: srv.save, fetch: async () => srv.stored.doc });
    const sync = new PortfolioSync(srv.stored.doc, d);

    srv.external(data([1, 'Savings', 100], [1, 'Cash', 5]));
    sync.apply({ type: 'renameSource', from: 'Savings', to: 'Cash' });
    expect(await sync.flush()).toBe('synced');
    expect(d.onDropped).toHaveBeenCalledWith(['A source called "Cash" already exists. Pick another name.']);
    // Nothing left to write after the drop: one attempt, no retry.
    expect(srv.saves).toHaveLength(1);
    expect(values(sync.doc.data)).toEqual(['1:Cash=5', '1:Savings=100']);
  });

  it("keeps a rename and the partner's new name doesn't undo it", async () => {
    const srv = server({ meta, data: data([1, 'Savings', 100]) });
    const sync = new PortfolioSync(srv.stored.doc, deps({ save: srv.save, fetch: async () => srv.stored.doc }));
    srv.external(srv.stored.doc.data, 'Household');
    sync.rename('Our money');
    expect(await sync.flush()).toBe('synced');
    expect(srv.stored.doc.meta.name).toBe('Our money');
    expect(sync.doc.meta.name).toBe('Our money');
  });

  it('queues an edit made while a save is in flight behind it', async () => {
    const srv = server({ meta, data: null });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const save = vi.fn(async (m: ExtraPortfolioMeta, d: PortfolioData | null) => {
      if (srv.saves.length === 0) await gate;
      return srv.save(m, d);
    });
    const sync = new PortfolioSync(srv.stored.doc, deps({ save, fetch: async () => srv.stored.doc }));

    sync.apply({ type: 'addEntries', date: day(1), entries: [{ name: 'Savings', value: 1, currency: 'EUR' }] });
    const first = sync.flush();
    sync.apply({ type: 'addEntries', date: day(2), entries: [{ name: 'Savings', value: 2, currency: 'EUR' }] });
    expect(save).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe('synced');
    expect(srv.saves.map((s) => s.meta.revision)).toEqual([1, 2]);
    expect(values(srv.stored.doc.data)).toEqual(['1:Savings=1', '2:Savings=2']);
  });

  it('retries a transient failure once, then reports an error and keeps the edit', async () => {
    const offline = Object.assign(new TypeError('Failed to fetch'), {});
    const save = vi.fn().mockRejectedValue(offline);
    const d = deps({ save });
    const sync = new PortfolioSync({ meta, data: null }, d);
    sync.apply({ type: 'addEntries', date: day(1), entries: [{ name: 'Savings', value: 1, currency: 'EUR' }] });

    expect(await sync.flush()).toBe('error');
    expect(save).toHaveBeenCalledTimes(2);
    expect(d.onError).toHaveBeenCalledWith(offline, true);
    expect(d.onState).toHaveBeenLastCalledWith('error');
    expect(sync.settled).toBe(false);

    save.mockResolvedValue({ status: 'ok', revision: 2 });
    expect(await sync.flush()).toBe('synced');
    expect(sync.settled).toBe(true);
  });

  it('gives up after repeated conflicts', async () => {
    const save = vi.fn(async (): Promise<SaveOutcome> => ({ status: 'conflict', revision: 9 }));
    const d = deps({ save, fetch: async () => ({ meta: { ...meta, revision: 9 }, data: null }) });
    const sync = new PortfolioSync({ meta, data: null }, d);
    sync.apply({ type: 'addEntries', date: day(1), entries: [{ name: 'Savings', value: 1, currency: 'EUR' }] });
    expect(await sync.flush()).toBe('error');
    expect(save).toHaveBeenCalledTimes(MAX_CONFLICTS + 1);
  });

  it('discards edits and reports when access is gone', async () => {
    const d = deps({ save: async () => ({ status: 'forbidden' }) });
    const sync = new PortfolioSync({ meta, data: null }, d);
    sync.apply({ type: 'addEntries', date: day(1), entries: [{ name: 'Savings', value: 1, currency: 'EUR' }] });
    expect(await sync.flush()).toBe('forbidden');
    expect(d.onForbidden).toHaveBeenCalledTimes(1);
    expect(sync.settled).toBe(true);
  });

  it('rotates after the save in flight, carrying unsaved edits into the new key', async () => {
    const srv = server({ meta, data: data([1, 'Savings', 100]) });
    const rotate = vi.fn(async (m: ExtraPortfolioMeta, d: PortfolioData | null) => {
      srv.stored.doc = { meta: { ...m, revision: m.revision + 1, keyEpoch: m.keyEpoch + 1 }, data: d };
      return { status: 'ok' as const, revision: m.revision + 1, keyEpoch: m.keyEpoch + 1 };
    });
    const d = deps({ save: srv.save, rotate, fetch: async () => srv.stored.doc });
    const sync = new PortfolioSync(srv.stored.doc, d);
    sync.apply({ type: 'addEntries', date: day(2), entries: [{ name: 'Savings', value: 110, currency: 'EUR' }] });
    expect(await sync.requestRotation()).toBe('synced');
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(sync.doc.meta).toMatchObject({ keyEpoch: 2, rotationDue: false });
    expect(values(srv.stored.doc.data)).toEqual(['1:Savings=100', '2:Savings=110']);
    expect(sync.settled).toBe(true);
  });

  it('stops asking to rotate while someone is still a member', async () => {
    const rotate = vi.fn(async () => ({ status: 'members_remain' as const }));
    const sync = new PortfolioSync({ meta, data: null }, deps({ rotate }));
    expect(await sync.requestRotation()).toBe('synced');
    expect(rotate).toHaveBeenCalledTimes(1);
    expect(sync.settled).toBe(true);
  });

  it('adopts a newer stored version only when idle, replaying nothing if nothing is pending', () => {
    const sync = new PortfolioSync({ meta, data: data([1, 'Savings', 100]) }, deps());
    expect(sync.adopt({ meta: { ...meta, revision: 3 }, data: data([1, 'Savings', 300]) })).toBe(true);
    expect(values(sync.doc.data)).toEqual(['1:Savings=300']);
    expect(sync.adopt({ meta: { ...meta, revision: 2 }, data: null })).toBe(false);
    expect(sync.doc.meta.revision).toBe(3);
  });

  it('keeps a pending import when the same version is adopted again', () => {
    const d = deps({ save: () => new Promise(() => {}) });
    const sync = new PortfolioSync({ meta, data: data([1, 'Savings', 100]) }, d);
    sync.dispose();
    sync.apply({ type: 'replaceAll', data: data([7, 'Imported', 1]) });
    expect(sync.adopt({ meta: { ...meta, rotationDue: true }, data: data([1, 'Savings', 100]) })).toBe(false);
  });

  it('does nothing after dispose', async () => {
    const d = deps({ save: vi.fn() });
    const sync = new PortfolioSync({ meta, data: null }, d);
    sync.dispose();
    sync.apply({ type: 'addEntries', date: day(1), entries: [{ name: 'Savings', value: 1, currency: 'EUR' }] });
    expect(await sync.flush()).toBe('error');
    expect(d.save).not.toHaveBeenCalled();
  });
});
