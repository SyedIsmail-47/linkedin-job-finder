import { describe, expect, it } from 'vitest';
import { BlockedError, LinkedInHttp, type HttpResult } from '../src/http.js';
import { newHttpStats } from '../src/types.js';
import { fixture } from './helpers.js';

const noSleep = async (): Promise<void> => {};

function client(script: HttpResult[], extra: { maxConsecutiveBlocks?: number; maxRetries?: number } = {}) {
  const stats = newHttpStats();
  const proxyUrls: (string | undefined)[] = [];
  const sessions: (string | undefined)[] = [];
  let i = 0;
  const http = new LinkedInHttp({
    delayMs: 1,
    stats,
    sleep: noSleep,
    random: () => 0.5,
    proxy: { newUrl: async (s) => { sessions.push(s); return `http://proxy/${s}`; } },
    request: async (_url, proxyUrl) => { proxyUrls.push(proxyUrl); return script[Math.min(i++, script.length - 1)] as HttpResult; },
    ...extra,
  });
  return { http, stats, sessions };
}

describe('LinkedInHttp', () => {
  it('returns a normal 200 straight away', async () => {
    const { http, stats } = client([{ status: 200, body: fixture('search-page.html') }]);
    expect((await http.get('https://x')).status).toBe(200);
    expect(stats.requests).toBe(1);
    expect(stats.statusHistogram).toEqual({ '200': 1 });
  });

  it('retires the session and retries after a 429', async () => {
    const { http, stats, sessions } = client([{ status: 429, body: '' }, { status: 200, body: 'ok' }]);
    const res = await http.get('https://x');
    expect(res.status).toBe(200);
    expect(stats.blocked).toBe(1);
    expect(stats.sessionsRetired).toBe(1);
    expect(stats.retries).toBe(1);
    expect(new Set(sessions).size).toBe(2); // a fresh proxy session was used for the retry
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
      delayMs: 1, stats, sleep: noSleep, random: () => 0.5,
      request: async () => { if (n++ === 0) throw new Error('ECONNRESET'); return { status: 200, body: 'ok' }; },
    });
    expect((await http.get('https://x')).body).toBe('ok');
    expect(stats.networkErrors).toBe(1);
  });
});
