import { describe, expect, it } from 'vitest';
import { applyOp, REPLACE_DROPPED, replayOps, type PortfolioOp } from '../portfolioOps';
import type { PortfolioData } from '../types';

const day = (d: number) => new Date(2026, 8, d);

function base(): PortfolioData {
  return {
    facts: [
      { date: day(1), idSource: 'Savings', sourceVl: 1000, currency: 'EUR' },
      { date: day(1), idSource: 'Brokerage', sourceVl: 5000, currency: 'EUR' },
    ],
    refSources: [
      { idSource: 'Savings', volatType: 'Non-volatile', transferableInDays: true },
      { idSource: 'Brokerage', volatType: 'Volatile', transferableInDays: false },
    ],
    goals: [
      { id: 'g1', name: 'House', targetAmount: 50000, targetCurrency: 'EUR', targetDate: '2030-01-01', createdAt: '2026-01-01T00:00:00Z' },
    ],
  };
}

const values = (data: PortfolioData | null) =>
  (data?.facts ?? []).map((f) => `${f.date.getDate()}:${f.idSource}=${f.sourceVl}`).sort();

describe('applyOp', () => {
  it('adds a new day and any new source', () => {
    const r = applyOp(base(), { type: 'addEntries', date: day(2), entries: [{ name: 'Savings', value: 1100, currency: 'EUR' }, { name: 'Cash', value: 50, currency: 'EUR', isLiquid: true }] });
    expect(r.changed).toBe(true);
    expect(values(r.data)).toEqual(['1:Brokerage=5000', '1:Savings=1000', '2:Cash=50', '2:Savings=1100']);
    expect(r.data?.refSources.map((s) => s.idSource)).toEqual(['Savings', 'Brokerage', 'Cash']);
    expect(r.data?.refSources[2]).toMatchObject({ volatType: 'Unknown', transferableInDays: true });
  });

  it('replaces the whole day when the day already has entries', () => {
    const r = applyOp(base(), { type: 'addEntries', date: day(1), entries: [{ name: 'Savings', value: 1200, currency: 'EUR' }] });
    expect(values(r.data)).toEqual(['1:Savings=1200']);
  });

  it('starts a portfolio from nothing', () => {
    const r = applyOp(null, { type: 'addEntries', date: day(3), entries: [{ name: 'Savings', value: 10, currency: 'EUR' }] });
    expect(r.data).toMatchObject({ refSources: [{ idSource: 'Savings' }], goals: [] });
  });

  it('edits, deletes and restores one entry by (date, source)', () => {
    const edited = applyOp(base(), { type: 'updateEntry', date: day(1), idSource: 'Savings', patch: { sourceVl: 999 } });
    expect(values(edited.data)).toContain('1:Savings=999');
    expect(applyOp(base(), { type: 'updateEntry', date: day(1), idSource: 'Savings', patch: { sourceVl: 1000 } }).changed).toBe(false);

    const removed = base().facts.filter((f) => f.idSource === 'Savings');
    const deleted = applyOp(base(), { type: 'deleteEntry', date: day(1), idSource: ' Savings ' });
    expect(values(deleted.data)).toEqual(['1:Brokerage=5000']);
    const restored = applyOp(deleted.data, { type: 'restoreEntries', facts: removed });
    expect(values(restored.data)).toEqual(['1:Brokerage=5000', '1:Savings=1000']);
    // A second restore finds the slot taken and changes nothing.
    expect(applyOp(restored.data, { type: 'restoreEntries', facts: removed }).changed).toBe(false);
  });

  it('renames a source everywhere, refusing a name another source has', () => {
    const r = applyOp(base(), { type: 'renameSource', from: 'Savings', to: 'Emergency fund' });
    expect(r.data?.refSources.map((s) => s.idSource)).toEqual(['Emergency fund', 'Brokerage']);
    expect(values(r.data)).toContain('1:Emergency fund=1000');

    const clash = applyOp(base(), { type: 'renameSource', from: 'Savings', to: 'brokerage' });
    expect(clash).toMatchObject({ changed: false, rejection: 'A source called "brokerage" already exists. Pick another name.' });
  });

  it('updates source settings only when something differs', () => {
    expect(applyOp(base(), { type: 'updateSource', idSource: 'Savings', patch: { isPaused: true } }).changed).toBe(true);
    expect(applyOp(base(), { type: 'updateSource', idSource: 'Savings', patch: { volatType: 'Non-volatile' } }).changed).toBe(false);
  });

  it('adds, edits and archives goals', () => {
    const goal = { id: 'g2', name: 'Car', targetAmount: 20000, targetCurrency: 'EUR' as const, targetDate: '2028-01-01', createdAt: '2026-09-01T00:00:00Z' };
    const added = applyOp(base(), { type: 'addGoal', goal });
    expect(added.data?.goals.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(applyOp(added.data, { type: 'updateGoal', id: 'g2', patch: { name: ' Van ' } }).data?.goals[1].name).toBe('Van');
    const archived = applyOp(added.data, { type: 'archiveGoal', id: 'g1', archivedAt: '2026-09-30T00:00:00Z' });
    expect(archived.data?.goals[0].archivedAt).toBe('2026-09-30T00:00:00Z');
  });
});

describe('applying an op twice changes nothing the second time', () => {
  // A save can land while its response is lost; the retry replays ops the
  // stored version already contains.
  const goal = { id: 'g2', name: 'Car', targetAmount: 20000, targetCurrency: 'EUR' as const, targetDate: '2028-01-01', createdAt: '2026-09-01T00:00:00Z' };
  const ops: PortfolioOp[] = [
    { type: 'addEntries', date: day(2), entries: [{ name: 'Savings', value: 1100, currency: 'EUR' }] },
    { type: 'updateEntry', date: day(1), idSource: 'Savings', patch: { sourceVl: 1 } },
    { type: 'deleteEntry', date: day(1), idSource: 'Brokerage' },
    { type: 'updateSource', idSource: 'Savings', patch: { category: 'Bank' } },
    { type: 'renameSource', from: 'Savings', to: 'Emergency fund' },
    { type: 'addGoal', goal },
    { type: 'updateGoal', id: 'g1', patch: { targetAmount: 60000 } },
    { type: 'archiveGoal', id: 'g1', archivedAt: '2026-09-30T00:00:00Z' },
  ];

  it.each(ops.map((op) => [op.type, op] as const))('%s', (_type, op) => {
    const once = applyOp(base(), op);
    expect(once.changed).toBe(true);
    const twice = applyOp(once.data, op);
    expect(twice.changed).toBe(false);
    expect(twice.rejection).toBeUndefined();
  });
});

describe('replayOps', () => {
  it("keeps both people's edits when they touched different days", () => {
    // Partner saved a new day; this tab's unsaved edit changed another day.
    const theirs = applyOp(base(), { type: 'addEntries', date: day(5), entries: [{ name: 'Brokerage', value: 5500, currency: 'EUR' }] }).data;
    const mine: PortfolioOp[] = [{ type: 'addEntries', date: day(3), entries: [{ name: 'Savings', value: 1050, currency: 'EUR' }] }];
    const r = replayOps(theirs, mine);
    expect(r.dropped).toEqual([]);
    expect(values(r.data)).toEqual(['1:Brokerage=5000', '1:Savings=1000', '3:Savings=1050', '5:Brokerage=5500']);
  });

  it('carries an edit made under the old name over a rename', () => {
    // This tab renamed first; the partner's version still has the old name
    // and a new entry under it. The rename replays onto their entry too.
    const theirs = applyOp(base(), { type: 'addEntries', date: day(4), entries: [{ name: 'Savings', value: 1300, currency: 'EUR' }] }).data;
    const r = replayOps(theirs, [{ type: 'renameSource', from: 'Savings', to: 'Emergency fund' }]);
    expect(values(r.data)).toEqual(['1:Brokerage=5000', '1:Emergency fund=1000', '4:Emergency fund=1300']);
  });

  it('drops a rename that now clashes and says why', () => {
    const theirs = applyOp(base(), { type: 'addEntries', date: day(4), entries: [{ name: 'Emergency fund', value: 1, currency: 'EUR' }] }).data;
    const r = replayOps(theirs, [
      { type: 'renameSource', from: 'Savings', to: 'Emergency fund' },
      { type: 'updateGoal', id: 'g1', patch: { name: 'Flat' } },
    ]);
    expect(r.dropped).toEqual(['A source called "Emergency fund" already exists. Pick another name.']);
    expect(r.kept.map((op) => op.type)).toEqual(['updateGoal']);
    expect(r.data?.goals[0].name).toBe('Flat');
  });

  it('drops a replace-everything op rather than wiping the other edits', () => {
    const r = replayOps(base(), [{ type: 'replaceAll', data: { facts: [], refSources: [], goals: [] } }]);
    expect(r.dropped).toEqual([REPLACE_DROPPED]);
    expect(r.kept).toEqual([]);
    expect(r.data).toEqual(base());
  });

  it('keeps a goal archived by the partner archived', () => {
    const theirs = applyOp(base(), { type: 'archiveGoal', id: 'g1', archivedAt: '2026-09-29T00:00:00Z' }).data;
    const r = replayOps(theirs, [{ type: 'archiveGoal', id: 'g1', archivedAt: '2026-09-30T00:00:00Z' }]);
    expect(r.data?.goals[0].archivedAt).toBe('2026-09-29T00:00:00Z');
    expect(r.dropped).toEqual([]);
  });
});
