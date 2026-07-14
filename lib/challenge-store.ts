/**
 * In-memory challenge store for WebAuthn registration and login flows.
 * Challenges are single-use and expire after 5 minutes.
 *
 * NOTE: This is module-scoped — it persists within a single Node.js process.
 * For multi-process deployments (e.g. Railway with multiple workers), replace
 * this with a shared store such as Redis or a `challenges` SQLite table.
 */

interface ChallengeEntry {
  challenge: string;
  expiresAt: number;
}

const store = new Map<string, ChallengeEntry>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export const challengeStore = {
  save(key: string, challenge: string): void {
    store.set(key, { challenge, expiresAt: Date.now() + TTL_MS });
  },

  /**
   * Retrieves and deletes a challenge (one-time use). Returns null if absent or expired.
   */
  consume(key: string): string | null {
    const entry = store.get(key);
    if (!entry) return null;
    store.delete(key);
    if (Date.now() > entry.expiresAt) return null;
    return entry.challenge;
  },
};
