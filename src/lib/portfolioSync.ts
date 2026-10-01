/**
 * Keeps one extra portfolio in step with the server. Spec:
 * docs/security/encryption.md §9.3 (save) and §8.9 (rotation).
 *
 * The sync holds the last stored version (`base`) and the edits made since
 * (`pending`, as ops). What the user sees is base plus pending. One write
 * runs at a time, each a compare-and-swap on the base's revision:
 *   - ok: the written content becomes the base and those ops are done;
 *   - conflict: someone else saved first. Fetch their version, replay the
 *     pending ops on top (portfolioOps.replayOps), and write again;
 *   - forbidden: access is gone. Pending ops are discarded.
 *
 * A key rotation is a write too, so it queues behind any save in flight
 * and carries the pending ops with it.
 *
 * No React here: PortfolioContext wires the callbacks to its state.
 */

import { isTransientError } from './cloudSync';
import { applyOp, replayOps, type OpResult, type PortfolioOp } from './portfolioOps';
import type { ExtraPortfolioMeta, SaveOutcome } from './portfolios';
import type { PortfolioData } from './types';

export interface SyncDoc {
  meta: ExtraPortfolioMeta;
  data: PortfolioData | null;
}

export type RotateOutcome =
  | { status: 'ok'; revision: number; keyEpoch: number }
  | { status: 'conflict' }
  | { status: 'members_remain' }
  | { status: 'forbidden' };

export type SyncState = 'syncing' | 'synced' | 'error';
export type FlushResult = 'synced' | 'error' | 'forbidden';

export interface PortfolioSyncDeps {
  /** Compare-and-swap write of the whole blob at meta.revision / meta.keyEpoch. */
  save(meta: ExtraPortfolioMeta, data: PortfolioData | null): Promise<SaveOutcome>;
  /** Re-encrypt under a new key. Only the owner, and only once they're the only member. */
  rotate(meta: ExtraPortfolioMeta, data: PortfolioData | null): Promise<RotateOutcome>;
  /** The stored version, decrypted. null when the portfolio is gone or the user lost access. */
  fetch(): Promise<SyncDoc | null>;
  /** The view changed without a local edit: pending ops replayed on newer content. */
  onView(doc: SyncDoc): void;
  /** A write landed. meta carries the new revision, and the new epoch after a rotation. */
  onSaved(meta: ExtraPortfolioMeta): void;
  onState(state: SyncState): void;
  /** Ops that no longer applied after a replay, as messages for the user. */
  onDropped(messages: string[]): void;
  onForbidden(): void;
  onError(error: unknown, transient: boolean): void;
  delay(ms: number): Promise<void>;
}

type RenameOp = { type: 'renamePortfolio'; name: string };
type SyncOp = PortfolioOp | RenameOp;

const isRename = (op: SyncOp): op is RenameOp => op.type === 'renamePortfolio';

/** Writes that lose the compare-and-swap this many times in a row give up until the next edit or retry. */
export const MAX_CONFLICTS = 5;
const RETRY_DELAY_MS = 2000;

export class PortfolioSync {
  private base: SyncDoc;
  private view: SyncDoc;
  private pending: SyncOp[] = [];
  private rotationWanted = false;
  private running: Promise<FlushResult> | null = null;
  private disposed = false;

  constructor(base: SyncDoc, private readonly deps: PortfolioSyncDeps) {
    this.base = base;
    this.view = base;
  }

  /** What the user should see: the stored version plus unsaved edits. */
  get doc(): SyncDoc {
    return this.view;
  }

  /** Nothing unsaved and nothing running. */
  get settled(): boolean {
    return !this.running && this.pending.length === 0 && !this.rotationWanted;
  }

  /** Applies an edit to the view and queues it for saving if it changed anything. */
  apply(op: PortfolioOp): OpResult {
    const result = applyOp(this.view.data, op);
    if (!result.changed) return result;
    this.pending.push(op);
    this.view = { meta: this.view.meta, data: result.data };
    void this.flush();
    return result;
  }

  /** The name is inside the blob, so a rename is an edit like any other. */
  rename(name: string): boolean {
    if (name === this.view.meta.name) return false;
    this.pending.push({ type: 'renamePortfolio', name });
    this.view = { meta: { ...this.view.meta, name }, data: this.view.data };
    void this.flush();
    return true;
  }

  /**
   * Newer stored content, from a reload or a refetch on focus. Refused while
   * a write is running: that write's own conflict handling will rebase.
   */
  adopt(latest: SyncDoc): boolean {
    if (this.running || this.disposed) return false;
    if (latest.meta.revision < this.base.meta.revision) return false;
    if (latest.meta.revision === this.base.meta.revision && latest.meta.keyEpoch === this.base.meta.keyEpoch) {
      // Same version: keep the replay-free view, only refresh flags such as rotationDue.
      this.base = { meta: latest.meta, data: this.base.data };
      this.view = { meta: { ...latest.meta, name: this.view.meta.name }, data: this.view.data };
      return true;
    }
    this.rebase(latest);
    return true;
  }

  requestRotation(): Promise<FlushResult> {
    this.rotationWanted = true;
    return this.flush();
  }

  /** Writes whatever is unsaved. Resolves when the queue is empty or a write failed. */
  flush(): Promise<FlushResult> {
    if (this.running) return this.running;
    if (this.disposed) return Promise.resolve('error');
    if (this.pending.length === 0 && !this.rotationWanted) return Promise.resolve('synced');
    const run = this.loop();
    this.running = run;
    void run.then((result) => {
      this.running = null;
      // An edit that arrived after the loop's last check but before this
      // callback would otherwise wait for the next edit.
      if (result === 'synced' && !this.settled) void this.flush();
    });
    return run;
  }

  /** Stops all callbacks, e.g. on sign-out or when the portfolio is deleted. */
  dispose(): void {
    this.disposed = true;
  }

  private async loop(): Promise<FlushResult> {
    this.deps.onState('syncing');
    let conflicts = 0;
    while (!this.disposed && (this.pending.length > 0 || this.rotationWanted)) {
      const count = this.pending.length;
      const target = this.view;
      const rotating = this.rotationWanted;
      const meta = { ...this.base.meta, name: target.meta.name };

      let outcome: SaveOutcome | RotateOutcome;
      try {
        outcome = await this.withRetry<SaveOutcome | RotateOutcome>(() =>
          rotating ? this.deps.rotate(meta, target.data) : this.deps.save(meta, target.data),
        );
      } catch (e) {
        return this.fail(e);
      }
      if (this.disposed) return 'error';

      if (outcome.status === 'ok') {
        conflicts = 0;
        const saved: ExtraPortfolioMeta = {
          ...meta,
          revision: outcome.revision,
          keyEpoch: 'keyEpoch' in outcome ? outcome.keyEpoch : meta.keyEpoch,
          rotationDue: rotating ? false : meta.rotationDue,
        };
        this.base = { meta: saved, data: target.data };
        this.pending = this.pending.slice(count);
        if (rotating) this.rotationWanted = false;
        this.view = { meta: { ...saved, name: this.view.meta.name }, data: this.view.data };
        this.deps.onSaved(this.view.meta);
        continue;
      }

      if (outcome.status === 'conflict') {
        conflicts += 1;
        if (conflicts > MAX_CONFLICTS) return this.fail(new Error('portfolio save kept conflicting'));
        let latest: SyncDoc | null;
        try {
          latest = await this.deps.fetch();
        } catch (e) {
          return this.fail(e);
        }
        if (this.disposed) return 'error';
        if (!latest) return this.forbid();
        this.rebase(latest);
        this.deps.onView(this.view);
        continue;
      }

      if (outcome.status === 'members_remain') {
        // Someone is still a member, so rotating now would lock them out.
        this.rotationWanted = false;
        continue;
      }

      return this.forbid();
    }
    if (!this.disposed) this.deps.onState('synced');
    return 'synced';
  }

  private rebase(latest: SyncDoc): void {
    this.base = latest;
    const replay = replayOps(latest.data, this.pending.filter((op): op is PortfolioOp => !isRename(op)));
    const renames = this.pending.filter(isRename);
    const name = renames.length > 0 ? renames[renames.length - 1].name : latest.meta.name;
    this.pending = [...replay.kept, ...renames];
    this.view = { meta: { ...latest.meta, name }, data: replay.data };
    if (replay.dropped.length > 0) this.deps.onDropped(replay.dropped);
  }

  private async withRetry<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (e) {
      if (!isTransientError(e)) throw e;
      await this.deps.delay(RETRY_DELAY_MS);
      return write();
    }
  }

  private fail(error: unknown): FlushResult {
    if (this.disposed) return 'error';
    this.deps.onError(error, isTransientError(error));
    this.deps.onState('error');
    return 'error';
  }

  private forbid(): FlushResult {
    this.pending = [];
    this.rotationWanted = false;
    if (!this.disposed) this.deps.onForbidden();
    return 'forbidden';
  }
}
