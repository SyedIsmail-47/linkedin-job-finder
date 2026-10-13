import { describe, expect, it } from 'vitest';
import { BlockedError, LinkedInHttp, parseRetryAfterMs, requestKind, type HttpResult } from '../src/http.js';
import { newHttpStats } from '../src/types.js';
import { fixture } from './helpers.js';

const noSleep = async (): Promise<void> => {};

function client(
  script: HttpResult[],
  extra: { maxConsecutiveBlocks?: number; maxRetries?: number; delayMs?: number; now?: () => number } = {},
) {
  const stats = newHttpStats();
  const proxyUrls: (string | undefined)[] = [];
  const sessions: (string | undefined)[] = [];
  const sleeps: number[] = [];
  let i = 0;
  const http = new LinkedInHttp({
    delayMs: extra.delayMs ?? 1,
    stats,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    now: extra.now ?? (() => 1_700_000_000_000),
    proxy: {
      newUrl: async (s) => {
        sessions.push(s);
        return `http://proxy/${s}`;
      },
    },
    request: async (_url, proxyUrl) => {
      proxyUrls.push(proxyUrl);
      return script[Math.min(i++, script.length - 1)] as HttpResult;
    },
    maxConsecutiveBlocks: extra.maxConsecutiveBlocks,
    maxRetries: extra.maxRetries,
  });
  return { http, stats, sessions, sleeps };
}

describe('LinkedInHttp', () => {
  it('returns a normal 200 straight away', async () => {
    const { http, stats } = client([{ status: 200, body: fixture('search-page.html') }]);
    expect((await http.get('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?x=1')).status).toBe(200);
    expect(stats.requests).toBe(1);
    expect(stats.statusHistogram).toEqual({ '200': 1 });
    expect(stats.requestsByKind.search).toBe(1);
    expect(stats.bytesReceived).toBeGreaterThan(0);
  });

  it('retires the session and retries after a 429', async () => {
    const { http, stats, sessions } = client([{ status: 429, body: '' }, { status: 200, body: 'ok' }]);
    const res = await http.get('https://x');
    expect(res.status).toBe(200);
    expect(stats.blocked).toBe(1);
    expect(stats.sessionsRetired).toBe(1);
    expect(stats.retries).toBe(1);
    expect(new Set(sessions).size).toBe(2);
  });

  it('honors Retry-After seconds on 429', async () => {
    const { http, stats, sleeps } = client([
      { status: 429, body: '', headers: { 'retry-after': '7' } },
      { status: 200, body: 'ok' },
    ]);
    await http.get('https://x');
    expect(sleeps).toContain(7000);
    expect(stats.totalBackoffMs).toBeGreaterThanOrEqual(7000);
  });

  it('raises adaptive delay on 429 and never below base', async () => {
    const { http } = client(
      [
        { status: 429, body: '' },
        { status: 200, body: 'ok' },
      ],
      { delayMs: 1000 },
    );
    expect(http.adaptiveDelayMs).toBe(1000);
    await http.get('https://x');
    expect(http.adaptiveDelayMs).toBe(1500);
  });

  it('lowers adaptive delay 10% after 20 consecutive successes, not below base', async () => {
    const script: HttpResult[] = [
      { status: 429, body: '' },
      ...Array.from({ length: 40 }, () => ({ status: 200, body: 'ok' })),
    ];
    const { http } = client(script, { delayMs: 1000 });
    await http.get('https://x'); // 429 then success → delay 1500, successes=1
    expect(http.adaptiveDelayMs).toBe(1500);
    for (let i = 0; i < 18; i++) await http.get('https://x');
    expect(http.adaptiveDelayMs).toBe(1500);
    await http.get('https://x'); // 20th success → 1500 * 0.9
    expect(http.adaptiveDelayMs).toBe(1350);
    for (let i = 0; i < 20; i++) await http.get('https://x');
    expect(http.adaptiveDelayMs).toBeGreaterThanOrEqual(1000);
    expect(http.adaptiveDelayMs).toBeLessThan(1350);
  });

  it('treats an auth-wall 200 as a block', async () => {
    const { http, stats } = client([{ status: 200, body: fixture('blocked-authwall.html') }, { status: 200, body: 'fine' }]);
    expect((await http.get('https://x')).body).toBe('fine');
    expect(stats.blocked).toBe(1);
  });

  it('does not retry a 404', async () => {
    const { http, stats } = client([{ status: 404, body: '' }]);
    expect((await http.get('https://x')).status).toBe(404);
    expect(stats.requests).toBe(1);
    expect(stats.blocked).toBe(0);
  });

  it('aborts with BlockedError after too many consecutive blocks', async () => {
    const { http } = client([{ status: 999, body: '' }], { maxConsecutiveBlocks: 3 });
    await expect(http.get('https://x')).rejects.toBeInstanceOf(BlockedError);
  });

  it('gives up with an empty result after exhausting retries on 5xx', async () => {
    const { http, stats } = client([{ status: 503, body: '' }], { maxRetries: 2 });
    const res = await http.get('https://x');
    expect(res).toEqual({ status: 503, body: '' });
    expect(stats.requests).toBe(3);
  });

  it('counts network errors and recovers', async () => {
    const stats = newHttpStats();
    let n = 0;
    const http = new LinkedInHttp({
      delayMs: 1,
      stats,
      sleep: noSleep,
      random: () => 0.5,
      request: async () => {
        if (n++ === 0) throw new Error('ECONNRESET');
        return { status: 200, body: 'ok' };
      },
    });
    expect((await http.get('https://x')).body).toBe('ok');
    expect(stats.networkErrors).toBe(1);
  });

  it('counts detail vs search by URL', async () => {
    const { http, stats } = client([{ status: 200, body: 'ok' }]);
    await http.get('https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/1');
    expect(stats.requestsByKind).toEqual({ search: 0, detail: 1 });
  });
});

describe('parseRetryAfterMs / requestKind', () => {
  it('parses delta-seconds and HTTP-date', () => {
    expect(parseRetryAfterMs('3', 0)).toBe(3000);
    expect(parseRetryAfterMs(undefined, 0)).toBeNull();
    const now = Date.parse('Wed, 14 Oct 2026 00:00:00 GMT');
    expect(parseRetryAfterMs('Wed, 14 Oct 2026 00:00:05 GMT', now)).toBe(5000);
  });
  it('classifies guest URLs', () => {
    expect(requestKind('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?x=1')).toBe('search');
    expect(requestKind('https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/9')).toBe('detail');
    expect(requestKind('https://example.com')).toBeNull();
  });
});
