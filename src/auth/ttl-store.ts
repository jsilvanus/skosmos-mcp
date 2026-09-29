/**
 * Small in-memory key/value store with per-entry expiry and single-use `take()`.
 *
 * Used for the short-lived OAuth authorization codes (60 s) and pending OIDC sign-ins (10 min).
 * This server has no database and is meant to be stateless; losing these on a restart only
 * interrupts sign-ins that are in flight at that moment. Run a single instance (or sticky
 * sessions) when OIDC is on.
 */
export class TtlStore<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();

  constructor(
    private readonly maxEntries = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  set(key: string, value: T, ttlMs: number): void {
    this.sweep();
    if (this.entries.size >= this.maxEntries) {
      // Drop the oldest entry (Map keeps insertion order) rather than growing without bound.
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expires: this.now() + ttlMs });
  }

  /** Returns the value and deletes it (single use). Expired entries are never returned. */
  take(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    return entry.expires >= this.now() ? entry.value : undefined;
  }

  get size(): number {
    return this.entries.size;
  }

  /** Deletes expired entries (opportunistically, on every write). */
  sweep(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expires < now) this.entries.delete(key);
    }
  }
}
