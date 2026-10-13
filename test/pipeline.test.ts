import { describe, expect, it } from 'vitest';
import type { SeenLike } from '../src/dedupe.js';
import { BlockedError, type HttpClient } from '../src/http.js';
import { normalizeInput } from '../src/input.js';
import { MockHttpClient } from '../src/mock.js';
import { runPipeline, type ChargeEvent } from '../src/pipeline.js';
import { newRunStats, type JobItem } from '../src/types.js';
import { fixtureDir, silentLog } from './helpers.js';

function harness(rawInput: Record<string, unknown>, opts: { seen?: SeenLike | null; limitAfter?: number; http?: HttpClient } = {}) {
  const input = normalizeInput({ keywords: ['data engineer'], locations: ['Berlin'], requestDelayMs: 300, ...rawInput });
  const items: JobItem[] = [];
  const charges: ChargeEvent[] = [];
  const stats = newRunStats();
  const run = () =>
    runPipeline(
      input,
      {
        http: opts.http ?? new MockHttpClient(fixtureDir),
        seen: opts.seen ?? null,
        log: silentLog,
        now: () => new Date('2026-10-13T00:00:00Z'),
        emit: async (i) => { items.push(i); },
        charge: async (e) => { charges.push(e); return opts.limitAfter !== undefined && charges.length >= opts.limitAfter; },
      },
      stats,
    );
  return { run, items, charges, stats };
}

describe('runPipeline', () => {
  it('collects every job with details and charges both events', async () => {
    const h = harness({});
    await h.run();
    expect(h.items.map((i) => i.id)).toEqual(['1000000001', '1000000002', '1000000003', '1000000004']);
    expect(h.stats.jobsPushed).toBe(4);
    expect(h.stats.detailsOk).toBe(4);
    expect(h.charges.filter((c) => c === 'job-listed')).toHaveLength(4);
    expect(h.charges.filter((c) => c === 'job-enriched')).toHaveLength(4);
    expect(h.items[0]?.applyUrl).toBe('https://careers.acme-analytics.example/jobs/42?src=linkedin');
    expect(h.items[1]?.applyType).toBe('EASY_APPLY');
  });

  it('respects maxJobsPerSearch', async () => {
    const h = harness({ maxJobsPerSearch: 2 });
    await h.run();
    expect(h.items).toHaveLength(2);
  });

  it('applies card filters before fetching details (rejected jobs cost nothing)', async () => {
    const h = harness({ titleExclude: ['intern'] });
    await h.run();
    expect(h.items.map((i) => i.id)).not.toContain('1000000004');
    expect(h.stats.filteredOut).toBe(1);
    expect(h.stats.detailsOk).toBe(3);
  });

  it('card-only mode fetches no details and never charges job-enriched', async () => {
    const h = harness({ fetchDetails: false });
    await h.run();
    expect(h.items).toHaveLength(4);
    expect(h.charges.every((c) => c === 'job-listed')).toBe(true);
    expect(h.items.every((i) => !i.detailsFetched)).toBe(true);
  });

  it('skips jobs already seen (incremental mode) and records new ones', async () => {
    const known = new Set(['1000000001', '1000000002']);
    const seen: SeenLike = { has: (id) => known.has(id), add: (id) => void known.add(id) };
    const h = harness({}, { seen });
    await h.run();
    expect(h.items.map((i) => i.id)).toEqual(['1000000003', '1000000004']);
    expect(h.stats.skippedSeen).toBe(2);
    expect(known.has('1000000003')).toBe(true);
    // a second run finds nothing new and charges nothing
    const h2 = harness({}, { seen });
    await h2.run();
    expect(h2.items).toHaveLength(0);
    expect(h2.charges).toHaveLength(0);
  });

  it('counts a job found by two searches only once', async () => {
    const h = harness({ keywords: ['data engineer', 'analytics engineer'] });
    await h.run();
    expect(h.items).toHaveLength(4);
    expect(h.stats.duplicatesInRun).toBe(4);
  });

  it('stops cleanly when the charge limit is reached and keeps what it has', async () => {
    const h = harness({}, { limitAfter: 2 }); // limit hits during the first job (listed + enriched)
    await h.run();
    expect(h.items).toHaveLength(1);
    expect(h.stats.stoppedByChargeLimit).toBe(true);
  });

  it('does not charge job-enriched after charge limit is reached on job-listed', async () => {
    const h = harness({}, { limitAfter: 1 });
    await h.run();
    expect(h.items).toHaveLength(1);
    expect(h.charges).toEqual(['job-listed']);
    expect(h.stats.stoppedByChargeLimit).toBe(true);
  });

  it('does not charge when emit throws (push failed)', async () => {
    const input = normalizeInput({ keywords: ['data engineer'], locations: ['Berlin'], requestDelayMs: 300 });
    const charges: ChargeEvent[] = [];
    await expect(
      runPipeline(
        input,
        {
          http: new MockHttpClient(fixtureDir),
          seen: null,
          log: silentLog,
          emit: async () => {
            throw new Error('pushData failed');
          },
          charge: async (e) => {
            charges.push(e);
            return false;
          },
        },
        newRunStats(),
      ),
    ).rejects.toThrow('pushData failed');
    expect(charges).toEqual([]);
  });

  it('calls onQueryDone after each completed search query', async () => {
    const input = normalizeInput({
      keywords: ['data engineer', 'analytics engineer'],
      locations: ['Berlin'],
      requestDelayMs: 300,
    });
    let saves = 0;
    await runPipeline(
      input,
      {
        http: new MockHttpClient(fixtureDir),
        seen: null,
        log: silentLog,
        emit: async () => {},
        charge: async () => false,
        onQueryDone: async () => {
          saves++;
        },
      },
      newRunStats(),
    );
    expect(saves).toBe(2);
  });

  it('ends gracefully with partial results when LinkedIn blocks mid-run', async () => {
    const real = new MockHttpClient(fixtureDir);
    let calls = 0;
    const flaky: HttpClient = {
      get: async (url) => {
        if (++calls > 2) throw new BlockedError('blocked 8 times');
        return real.get(url);
      },
    };
    const h = harness({ detailConcurrency: 1 }, { http: flaky });
    await h.run();
    expect(h.items.length).toBeGreaterThanOrEqual(1);
    expect(h.items.length).toBeLessThan(4);
    expect(h.stats.abortedReason).toContain('blocked');
  });

  it('survives a search page that returns an error status', async () => {
    const bad: HttpClient = { get: async () => ({ status: 500, body: '' }) };
    const h = harness({}, { http: bad });
    await h.run();
    expect(h.items).toHaveLength(0);
    expect(h.stats.abortedReason).toBeNull();
  });

  it('records a failed detail fetch without losing the job or charging enrichment', async () => {
    const real = new MockHttpClient(fixtureDir);
    const noDetail2: HttpClient = {
      get: async (url) => (url.includes('/jobPosting/1000000002') ? { status: 404, body: '' } : real.get(url)),
    };
    const h = harness({}, { http: noDetail2 });
    await h.run();
    expect(h.items).toHaveLength(4);
    expect(h.stats.detailFailures).toBe(1);
    expect(h.items.find((i) => i.id === '1000000002')?.detailsFetched).toBe(false);
    expect(h.charges.filter((c) => c === 'job-enriched')).toHaveLength(3);
  });
});

describe('runPipeline sample capture', () => {
  it('hands over exactly one raw search page and one raw detail page', async () => {
    const input = normalizeInput({ keywords: ['x'], locations: ['y'], requestDelayMs: 300 });
    const got: string[] = [];
    await runPipeline(
      input,
      {
        http: new MockHttpClient(fixtureDir),
        seen: null,
        log: silentLog,
        emit: async () => {},
        charge: async () => false,
        sample: async (kind, body) => { got.push(`${kind}:${body.length > 100}`); },
      },
      newRunStats(),
    );
    expect(got).toEqual(['search:true', 'detail:true']);
  });
});
