import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HttpClient, HttpResult } from './http.js';

/** Serves local fixture files instead of calling LinkedIn. Used by `npm run mock` and tests. */
export class MockHttpClient implements HttpClient {
  constructor(private readonly dir: string) {}

  async get(url: string): Promise<HttpResult> {
    const u = new URL(url);
    if (u.pathname.includes('/seeMoreJobPostings/')) {
      const start = Number(u.searchParams.get('start') ?? '0');
      return this.read(start === 0 ? 'search-page.html' : 'search-empty.html');
    }
    const m = /\/jobPosting\/(\d+)/.exec(u.pathname);
    if (m?.[1]) return this.read(`detail-${m[1]}.html`);
    return { status: 404, body: '' };
  }

  private async read(file: string): Promise<HttpResult> {
    try {
      return { status: 200, body: await readFile(join(this.dir, file), 'utf8') };
    } catch {
      return { status: 404, body: '' };
    }
  }
}
