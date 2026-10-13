import { gotScraping } from 'got-scraping';
import { looksBlocked } from './parse.js';
import type { HttpStats } from './types.js';

export interface HttpResult {
  status: number;
  body: string;
}
export interface HttpClient {
  get(url: string): Promise<HttpResult>;
}
export interface ProxyLike {
  newUrl(sessionId?: string): Promise<string | undefined>;
}
export type RequestFn = (url: string, proxyUrl: string | undefined) => Promise<HttpResult>;

export class BlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedError';
  }
}

export interface HttpOptions {
  proxy?: ProxyLike | undefined;
  delayMs: number;
  stats: HttpStats;
  maxRetries?: number;
  maxConsecutiveBlocks?: number;
  request?: RequestFn;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// HTTP/1.1 on purpose: one builder reports LinkedIn's edge blocks HTTP/2 fingerprints (single-source claim: verify in the spike).
const defaultRequest: RequestFn = async (url, proxyUrl) => {
  const res = await gotScraping({
    url,
    proxyUrl,
    http2: false,
    throwHttpErrors: false,
    retry: { limit: 0 },
    timeout: { request: 30_000 },
    headerGeneratorOptions: {
      browsers: [{ name: 'chrome', minVersion: 120 }],
      devices: ['desktop'],
      locales: ['en-US'],
      operatingSystems: ['windows'],
    },
  });
  return { status: res.statusCode, body: typeof res.body === 'string' ? res.body : String(res.body) };
};

/**
 * Throttled client for LinkedIn's logged-out guest endpoints.
 * Retires the proxy session on 429/999/403 or auth-wall/captcha pages, backs off, and aborts with
 * BlockedError after too many consecutive blocks so a run ends cleanly with partial results.
 */
export class LinkedInHttp implements HttpClient {
  private readonly proxy: ProxyLike | undefined;
  private readonly delayMs: number;
  private readonly stats: HttpStats;
  private readonly maxRetries: number;
  private readonly maxConsecutiveBlocks: number;
  private readonly request: RequestFn;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private sessionId: string;
  private sessionCounter = 0;
  private nextSlot = 0;
  private consecutiveBlocks = 0;

  constructor(opts: HttpOptions) {
    this.proxy = opts.proxy;
    this.delayMs = opts.delayMs;
    this.stats = opts.stats;
    this.maxRetries = opts.maxRetries ?? 5;
    this.maxConsecutiveBlocks = opts.maxConsecutiveBlocks ?? 8;
    this.request = opts.request ?? defaultRequest;
    this.sleep = opts.sleep ?? defaultSleep;
    this.random = opts.random ?? Math.random;
    this.sessionId = this.newSessionId();
  }

  private newSessionId(): string {
    // The counter guarantees a retired session is never replaced by an identical id.
    return `s${Date.now().toString(36)}_${(this.sessionCounter++).toString(36)}_${Math.floor(this.random() * 1e9).toString(36)}`;
  }

  private retireSession(): void {
    this.sessionId = this.newSessionId();
    this.stats.sessionsRetired++;
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const gap = this.delayMs * (0.7 + this.random() * 0.6);
    const wait = Math.max(0, this.nextSlot - now);
    this.nextSlot = Math.max(now, this.nextSlot) + gap;
    if (wait > 0) await this.sleep(wait);
  }

  private backoff(attempt: number, factor: number): number {
    return Math.min(30_000, 1_500 * factor * 2 ** attempt) * (0.75 + this.random() * 0.5);
  }

  async get(url: string): Promise<HttpResult> {
    let lastStatus = 0;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) this.stats.retries++;
      await this.throttle();

      let res: HttpResult;
      try {
        const proxyUrl = this.proxy ? await this.proxy.newUrl(this.sessionId) : undefined;
        res = await this.request(url, proxyUrl);
      } catch {
        this.stats.networkErrors++;
        await this.sleep(this.backoff(attempt, 1));
        continue;
      }

      this.stats.requests++;
      const key = String(res.status);
      this.stats.statusHistogram[key] = (this.stats.statusHistogram[key] ?? 0) + 1;
      lastStatus = res.status;

      const rateLimited = res.status === 429 || res.status === 999 || res.status === 403;
      const softBlocked = res.status === 200 && looksBlocked(res.body);

      if (res.status === 200 && !softBlocked) {
        this.consecutiveBlocks = 0;
        return res;
      }
      if (res.status >= 400 && res.status < 500 && !rateLimited) return res; // e.g. 404: final, not a block

      if (rateLimited || softBlocked) {
        this.consecutiveBlocks++;
        this.stats.blocked++;
        this.retireSession();
        if (this.consecutiveBlocks >= this.maxConsecutiveBlocks) {
          throw new BlockedError(
            `LinkedIn blocked ${this.consecutiveBlocks} requests in a row (last HTTP ${res.status}). Try residential proxies or a longer request delay.`,
          );
        }
        await this.sleep(this.backoff(attempt, 2));
        continue;
      }
      await this.sleep(this.backoff(attempt, 1)); // 5xx / unexpected
    }
    return { status: lastStatus, body: '' };
  }
}
