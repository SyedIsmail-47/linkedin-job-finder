import { describe, expect, it } from 'vitest';
import { SeenStore, storeNameFor, type KvLike } from '../src/dedupe.js';

class MemKv implements KvLike {
  data = new Map<string, unknown>();
  async getValue<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }
  async setValue(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }
}

describe('SeenStore', () => {
  it('remembers ids across save/load', async () => {
    const kv = new MemKv();
    const a = new SeenStore(kv);
    await a.load();
    a.add('1');
    a.add('2');
    await a.save();
    const b = new SeenStore(kv);
    await b.load();
    expect(b.has('1')).toBe(true);
    expect(b.has('3')).toBe(false);
    expect(b.size).toBe(2);
  });

  it('prunes entries older than the TTL on load', async () => {
    const kv = new MemKv();
    const day = 86_400_000;
    await kv.setValue('SEEN', { old: 1000, fresh: 100 * day });
    const s = new SeenStore(kv, 'SEEN', 60, () => 100 * day + 1);
    await s.load();
    expect(s.has('fresh')).toBe(true);
    expect(s.has('old')).toBe(false);
  });

  it('keeps the first-seen timestamp when an id is added twice', async () => {
    let t = 1;
    const kv = new MemKv();
    const s = new SeenStore(kv, 'SEEN', 60, () => t);
    s.add('x');
    t = 999;
    s.add('x');
    await s.save();
    expect((kv.data.get('SEEN') as Record<string, number>)['x']).toBe(1);
  });
});

describe('storeNameFor', () => {
  it('produces a valid named-store slug', () => {
    expect(storeNameFor('My Alert #1!')).toBe('ljf-seen-my-alert-1');
    expect(storeNameFor('!!!')).toBe('ljf-seen-default');
    expect(storeNameFor('x'.repeat(100)).length).toBeLessThanOrEqual(63);
  });
});
