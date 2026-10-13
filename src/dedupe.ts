export interface KvLike {
  getValue<T = unknown>(key: string): Promise<T | null>;
  setValue(key: string, value: unknown): Promise<void>;
}

export interface SeenLike {
  has(id: string): boolean;
  add(id: string): void;
}

/** Remembers job IDs across runs (incremental mode). Entries older than ttlDays are pruned on load. */
export class SeenStore implements SeenLike {
  private readonly map = new Map<string, number>();

  constructor(
    private readonly kv: KvLike,
    private readonly key = 'SEEN',
    private readonly ttlDays = 60,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<void> {
    const data = await this.kv.getValue<Record<string, number>>(this.key);
    if (!data) return;
    const cutoff = this.now() - this.ttlDays * 86_400_000;
    for (const [id, ts] of Object.entries(data)) {
      if (typeof ts === 'number' && ts >= cutoff) this.map.set(id, ts);
    }
  }

  has(id: string): boolean {
    return this.map.has(id);
  }

  add(id: string): void {
    if (!this.map.has(id)) this.map.set(id, this.now());
  }

  get size(): number {
    return this.map.size;
  }

  async save(): Promise<void> {
    await this.kv.setValue(this.key, Object.fromEntries(this.map));
  }
}

/** Apify named stores allow lowercase letters, digits and hyphens. */
export function storeNameFor(stateKey: string): string {
  const slug =
    stateKey
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'default';
  return `ljf-seen-${slug}`;
}
