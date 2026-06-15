import 'dotenv/config';
import { prepareSessions } from './helpers/auth';

/**
 * Mints the test-user sessions once, before any worker starts. See
 * prepareSessions for why this can't happen per-test (one-time-token race).
 * No-op when the E2E auth secrets are absent — the specs skip themselves.
 */
export default async function globalSetup() {
  await prepareSessions();
}
