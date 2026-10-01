/**
 * Every edit to a portfolio, as data. PortfolioContext applies each op to
 * what's on screen, and for an extra portfolio keeps the ops that aren't
 * saved yet: when a save loses the compare-and-swap to someone else's save
 * (a partner, or another device), the unsaved ops are applied again on top
 * of the stored version (portfolioSync.ts).
 *
 * Applying an op again must be safe: a save can land on the server while
 * its response is lost, and the retry then replays ops the stored version
 * already contains. Each op is written so that a second application changes
 * nothing.
 *
 * Why ops rather than merging two versions: facts have no ids, an entry
 * replaces its whole day, and renaming a source rewrites every fact that
 * uses it. A replayed op keeps the user's intent; a merge would have to guess.
 */

import type { CurrencyCode } from '@/lib/currencies';
import type { FactRow, Goal, PortfolioData } from '@/lib/types';

export interface NewEntry {
  name: string;
  value: number;
  currency: CurrencyCode;
  isLiquid?: boolean;
  volatType?: string;
  category?: string;
}

export type SourcePatch = { volatType?: string; isLiquid?: boolean; category?: string; isPaused?: boolean };
export type GoalPatch = Partial<Pick<Goal, 'name' | 'targetAmount' | 'targetCurrency' | 'targetDate'>>;

export type PortfolioOp =
  /** One day's values. Replaces whatever that day held: an entry is the whole picture of its day. */
  | { type: 'addEntries'; date: Date; entries: NewEntry[] }
  | { type: 'updateEntry'; date: Date; idSource: string; patch: { sourceVl?: number; currency?: CurrencyCode } }
  | { type: 'deleteEntry'; date: Date; idSource: string }
  /** Puts back facts a delete removed, for any (date, source) that is empty again. */
  | { type: 'restoreEntries'; facts: FactRow[] }
  | { type: 'updateSource'; idSource: string; patch: SourcePatch }
  | { type: 'renameSource'; from: string; to: string }
  | { type: 'addGoal'; goal: Goal }
  | { type: 'updateGoal'; id: string; patch: GoalPatch }
  | { type: 'archiveGoal'; id: string; archivedAt: string }
  /** A spreadsheet import or a restored version. */
  | { type: 'replaceAll'; data: PortfolioData };

export interface OpResult {
  data: PortfolioData | null;
  changed: boolean;
  /** Set when the op can't apply as asked; data is then unchanged. */
  rejection?: string;
}

const EMPTY: PortfolioData = { facts: [], refSources: [], goals: [] };

const factKey = (f: FactRow) => `${f.date.getTime()}::${f.idSource.trim()}`;

function unchanged(data: PortfolioData | null, rejection?: string): OpResult {
  return rejection ? { data, changed: false, rejection } : { data, changed: false };
}

export function applyOp(data: PortfolioData | null, op: PortfolioOp): OpResult {
  switch (op.type) {
    case 'addEntries': {
      if (op.entries.length === 0) return unchanged(data);
      const base = data ?? EMPTY;
      const day = op.date.getTime();
      const sameDay = base.facts.filter((f) => f.date.getTime() === day);
      const identical =
        data !== null &&
        sameDay.length === op.entries.length &&
        op.entries.every((e) => sameDay.some((f) => f.idSource === e.name && f.sourceVl === e.value && f.currency === e.currency)) &&
        op.entries.every((e) => base.refSources.some((s) => s.idSource === e.name));
      if (identical) return unchanged(data);
      const facts: FactRow[] = [
        ...base.facts.filter((f) => f.date.getTime() !== day),
        ...op.entries.map((e) => ({ date: new Date(day), idSource: e.name, sourceVl: e.value, currency: e.currency })),
      ];
      const known = new Set(base.refSources.map((s) => s.idSource));
      const refSources = [...base.refSources];
      for (const e of op.entries) {
        if (known.has(e.name)) continue;
        known.add(e.name);
        refSources.push({
          idSource: e.name,
          volatType: e.volatType?.trim() || 'Unknown',
          transferableInDays: e.isLiquid ?? false,
          category: e.category?.trim() || undefined,
        });
      }
      return { data: { ...base, facts, refSources }, changed: true };
    }

    case 'updateEntry': {
      if (!data) return unchanged(data);
      const day = op.date.getTime();
      const target = op.idSource.trim();
      let changed = false;
      const facts = data.facts.map((f) => {
        if (f.date.getTime() !== day || f.idSource.trim() !== target) return f;
        const sourceVl = op.patch.sourceVl ?? f.sourceVl;
        const currency = op.patch.currency ?? f.currency;
        if (sourceVl === f.sourceVl && currency === f.currency) return f;
        changed = true;
        return { ...f, sourceVl, currency };
      });
      return changed ? { data: { ...data, facts }, changed } : unchanged(data);
    }

    case 'deleteEntry': {
      if (!data) return unchanged(data);
      const day = op.date.getTime();
      const target = op.idSource.trim();
      const facts = data.facts.filter((f) => !(f.date.getTime() === day && f.idSource.trim() === target));
      return facts.length === data.facts.length ? unchanged(data) : { data: { ...data, facts }, changed: true };
    }

    case 'restoreEntries': {
      const base = data ?? EMPTY;
      const present = new Set(base.facts.map(factKey));
      const toAdd = op.facts.filter((f) => !present.has(factKey(f)));
      if (toAdd.length === 0) return unchanged(data);
      return { data: { ...base, facts: [...base.facts, ...toAdd] }, changed: true };
    }

    case 'updateSource': {
      if (!data) return unchanged(data);
      const target = op.idSource.trim();
      const { patch } = op;
      let changed = false;
      const refSources = data.refSources.map((rs) => {
        if (rs.idSource.trim() !== target) return rs;
        const next = {
          ...rs,
          volatType: patch.volatType !== undefined ? patch.volatType.trim() || 'Unknown' : rs.volatType,
          transferableInDays: patch.isLiquid ?? rs.transferableInDays,
          category: patch.category !== undefined ? patch.category.trim() || undefined : rs.category,
          isPaused: patch.isPaused ?? rs.isPaused,
        };
        if (
          next.volatType === rs.volatType &&
          next.transferableInDays === rs.transferableInDays &&
          next.category === rs.category &&
          next.isPaused === rs.isPaused
        ) {
          return rs;
        }
        changed = true;
        return next;
      });
      return changed ? { data: { ...data, refSources }, changed } : unchanged(data);
    }

    case 'renameSource': {
      if (!data) return unchanged(data);
      const from = op.from.trim();
      const to = op.to;
      if (from === to) return unchanged(data);
      // A source that's already gone (renamed or replayed) is a no-op, checked
      // before the clash so a replay doesn't clash with its own earlier result.
      if (!data.refSources.some((rs) => rs.idSource.trim() === from)) return unchanged(data);
      const clash = data.refSources.some((rs) => {
        const id = rs.idSource.trim();
        return id !== from && id.toLowerCase() === to.toLowerCase();
      });
      if (clash) return unchanged(data, `A source called "${to}" already exists. Pick another name.`);
      return {
        data: {
          ...data,
          refSources: data.refSources.map((rs) => (rs.idSource.trim() === from ? { ...rs, idSource: to } : rs)),
          facts: data.facts.map((f) => (f.idSource.trim() === from ? { ...f, idSource: to } : f)),
        },
        changed: true,
      };
    }

    case 'addGoal': {
      const base = data ?? EMPTY;
      if (base.goals.some((g) => g.id === op.goal.id)) return unchanged(data);
      return { data: { ...base, goals: [...base.goals, op.goal] }, changed: true };
    }

    case 'updateGoal': {
      if (!data) return unchanged(data);
      let changed = false;
      const goals = data.goals.map((g) => {
        if (g.id !== op.id) return g;
        const next = {
          ...g,
          name: op.patch.name !== undefined ? op.patch.name.trim() : g.name,
          targetAmount: op.patch.targetAmount ?? g.targetAmount,
          targetCurrency: op.patch.targetCurrency ?? g.targetCurrency,
          targetDate: op.patch.targetDate ?? g.targetDate,
        };
        if (
          next.name === g.name &&
          next.targetAmount === g.targetAmount &&
          next.targetCurrency === g.targetCurrency &&
          next.targetDate === g.targetDate
        ) {
          return g;
        }
        changed = true;
        return next;
      });
      return changed ? { data: { ...data, goals }, changed } : unchanged(data);
    }

    case 'archiveGoal': {
      if (!data) return unchanged(data);
      let changed = false;
      const goals = data.goals.map((g) => {
        if (g.id !== op.id || g.archivedAt) return g;
        changed = true;
        return { ...g, archivedAt: op.archivedAt };
      });
      return changed ? { data: { ...data, goals }, changed } : unchanged(data);
    }

    case 'replaceAll':
      return { data: op.data, changed: true };
  }
}

export interface ReplayResult {
  data: PortfolioData | null;
  /** The ops still to save: those that applied, or changed nothing yet stay harmless. */
  kept: PortfolioOp[];
  /** Messages for the ops that no longer apply and were dropped. */
  dropped: string[];
}

export const REPLACE_DROPPED =
  'The portfolio changed while you were replacing its entries, so they were left as they are. Try again.';

/**
 * Applies unsaved ops on top of a newer stored version. Ops that now clash
 * (a rename onto a name someone else took) are dropped with a message. A
 * replaceAll is dropped too: it was chosen against content that has since
 * changed, and replaying it would silently wipe the other person's edits.
 */
export function replayOps(data: PortfolioData | null, ops: readonly PortfolioOp[]): ReplayResult {
  let current = data;
  const kept: PortfolioOp[] = [];
  const dropped: string[] = [];
  for (const op of ops) {
    if (op.type === 'replaceAll') {
      dropped.push(REPLACE_DROPPED);
      continue;
    }
    const result = applyOp(current, op);
    if (result.rejection) {
      dropped.push(result.rejection);
      continue;
    }
    current = result.data;
    kept.push(op);
  }
  return { data: current, kept, dropped };
}
