/**
 * Capture guest LinkedIn HTML for fixtures.
 * NON-NEGOTIABLE: max 5 HTTP requests per execution, ≥5s apart, no loops/retries.
 * Stop on any non-200 or auth wall.
 *
 * Usage:
 *   npx tsx scripts/capture.ts
 *   npx tsx scripts/capture.ts --detail-only <jobId> <outPath>
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { gotScraping } from 'got-scraping';
import { looksBlocked, parseSearchCards } from '../src/parse.js';
import { buildDetailUrl, buildSearchUrl } from '../src/urls.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_REQUESTS = 5;
const GAP_MS = 5_000;
let requests = 0;

async function get(url: string): Promise<string> {
  if (requests >= MAX_REQUESTS) throw new Error(`Request budget exhausted (${MAX_REQUESTS}).`);
  if (requests > 0) await sleep(GAP_MS);
  requests++;
  console.log(`[${requests}/${MAX_REQUESTS}] GET ${url}`);
  const res = await gotScraping({
    url,
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
  const body = typeof res.body === 'string' ? res.body : String(res.body);
  if (res.statusCode !== 200) {
    console.error(`STOP: HTTP ${res.statusCode}`);
    process.exit(2);
  }
  if (looksBlocked(body)) {
    console.error('STOP: auth wall / captcha detected');
    process.exit(3);
  }
  return body;
}

async function detailOnly(id: string, out: string): Promise<void> {
  const body = await get(buildDetailUrl(id));
  writeFileSync(out, body, 'utf8');
  console.log(`Wrote ${out} (${body.length} chars)`);
}

async function fullCapture(): Promise<void> {
  mkdirSync('test/fixtures', { recursive: true });
  const searchUrl = buildSearchUrl(
    { keywords: 'software engineer', location: 'United States' },
    { datePosted: 'week', workTypes: [], jobTypes: [], experienceLevels: [], easyApplyOnly: false, sortBy: 'recent' },
    0,
  );
  const searchHtml = await get(searchUrl);
  writeFileSync('test/fixtures/real-search-page.raw.html', searchHtml, 'utf8');
  const cards = parseSearchCards(searchHtml);
  console.log(`Parsed ${cards.length} cards`);
  const first = cards[0];
  const second = cards[1];
  if (!first || !second) {
    console.error('STOP: need at least 2 cards');
    process.exit(4);
  }
  const d1 = await get(buildDetailUrl(first.id));
  writeFileSync('test/fixtures/real-detail-1.raw.html', d1, 'utf8');
  const d2 = await get(buildDetailUrl(second.id));
  writeFileSync('test/fixtures/real-detail-2.raw.html', d2, 'utf8');
  console.log('Done. Sanitize with scripts/sanitize-fixture.ts before committing.');
}

const args = process.argv.slice(2);
if (args[0] === '--detail-only') {
  const id = args[1];
  const out = args[2] ?? `test/fixtures/real-detail-${id}.raw.html`;
  if (!id) {
    console.error('Usage: --detail-only <jobId> [outPath]');
    process.exit(1);
  }
  await detailOnly(id, out);
} else {
  await fullCapture();
}
