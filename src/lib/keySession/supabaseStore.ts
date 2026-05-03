/**
 * Production KeyStore backed by Supabase.
 *
 * BYTEA columns travel as "\x"-prefixed hex strings (PostgREST default).
 * The bytea helper functions handle conversion in both directions; we treat
 * the supabase-js generated `string` type as opaque hex.
 */

import { supabase } from '@/integrations/supabase/client';
import { upsertEncryptedSnapshot } from '@/lib/cloudSync';
import type { PortfolioData } from '@/lib/types';
import { byteaToBytes, bytesToBytea } from './bytea';
import type { KeyStore, SnapshotStore } from './types';

export const supabaseKeyStore: KeyStore = {
  async getUserKeys(userId) {
    const { data, error } = await supabase
      .from('user_keys')
      .select(
        'user_id, kdf_salt, wrapped_dk_kek, wrapped_dk_recovery, recovery_kdf_salt, enc_version',
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      user_id: data.user_id,
      kdf_salt: byteaToBytes(data.kdf_salt as unknown as string),
      wrapped_dk_kek: byteaToBytes(data.wrapped_dk_kek as unknown as string),
      wrapped_dk_recovery: data.wrapped_dk_recovery
        ? byteaToBytes(data.wrapped_dk_recovery as unknown as string)
        : null,
      recovery_kdf_salt: data.recovery_kdf_salt
        ? byteaToBytes(data.recovery_kdf_salt as unknown as string)
        : null,
      enc_version: data.enc_version,
    };
  },

  async insertUserKeys(row) {
    const { error } = await supabase.from('user_keys').insert({
      user_id: row.user_id,
      kdf_salt: bytesToBytea(row.kdf_salt) as unknown as never,
      wrapped_dk_kek: bytesToBytea(row.wrapped_dk_kek) as unknown as never,
      wrapped_dk_recovery: row.wrapped_dk_recovery
        ? (bytesToBytea(row.wrapped_dk_recovery) as unknown as never)
        : null,
      recovery_kdf_salt: row.recovery_kdf_salt
        ? (bytesToBytea(row.recovery_kdf_salt) as unknown as never)
        : null,
      enc_version: row.enc_version,
    });
    if (error) throw error;
  },

  async hasPortfolioSnapshot(userId) {
    const { count, error } = await supabase
      .from('portfolio_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) throw error;
    return (count ?? 0) > 0;
  },

  async updatePasswordWrap(args) {
    const { error } = await supabase
      .from('user_keys')
      .update({
        kdf_salt: bytesToBytea(args.kdf_salt) as unknown as never,
        wrapped_dk_kek: bytesToBytea(args.wrapped_dk_kek) as unknown as never,
      })
      .eq('user_id', args.user_id);
    if (error) throw error;
  },

  async updateRecoveryWrap(args) {
    const { error } = await supabase
      .from('user_keys')
      .update({
        recovery_kdf_salt: bytesToBytea(args.recovery_kdf_salt) as unknown as never,
        wrapped_dk_recovery: bytesToBytea(args.wrapped_dk_recovery) as unknown as never,
      })
      .eq('user_id', args.user_id);
    if (error) throw error;
  },
};

export const supabaseSnapshotStore: SnapshotStore = {
  async getLegacyPlaintext(userId) {
    const { data, error } = await supabase
      .from('portfolio_snapshots')
      .select('data, enc_version')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    // We only return the payload for v0 (legacy) rows. v1 rows are already
    // encrypted; double-migration would be a no-op at best, a re-encrypt
    // under a new DK at worst (which we do NOT want here — the existing
    // user_keys row owns the only DK that can decrypt v1 rows).
    if (data.enc_version !== 0) return null;
    return data.data;
  },

  async upsertEncrypted(userId, plaintextPayload, dataKey) {
    // Reuse the production encrypt+upsert path. The cast is safe: the
    // function's body JSON.stringifies the payload and never inspects its
    // type — see cloudSync.ts.
    await upsertEncryptedSnapshot(
      supabase,
      userId,
      plaintextPayload as PortfolioData,
      dataKey,
    );
  },
};
