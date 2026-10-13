import { describe, expect, it } from 'vitest';
import type { NotifyConfig } from '../src/input.js';
import { escapeHtml, formatDigest, sendNotifications } from '../src/notify.js';
import type { JobItem } from '../src/types.js';
import { silentLog } from './helpers.js';

const job = (over: Partial<JobItem> = {}): JobItem => ({
  id: '1', url: 'https://www.linkedin.com/jobs/view/1', title: 'Data <Engineer> & Co', company: 'Acme', companyUrl: null,
  location: 'Berlin', workplaceType: null, postedAt: null, postedAtText: null, salaryText: null, seniorityLevel: null,
  employmentType: null, jobFunction: null, industries: null, applicantsText: null, applyType: 'EXTERNAL',
  applyUrl: 'https://careers.example/1', description: 'x', requirements: [], requirementsSource: 'none',
  skills: ['Python', 'SQL'], minYearsExperience: 3, detailsFetched: true, searchKeyword: 'k', searchLocation: 'l',
  scrapedAt: '2026-10-13T00:00:00Z', ...over,
});

const cfg = (over: Partial<NotifyConfig> = {}): NotifyConfig => ({
  telegramToken: '', telegramChatId: '', discordWebhookUrl: '', slackWebhookUrl: '', webhookUrl: '', notificationLimit: 5, ...over,
});

interface Call { url: string; body: any }
function fakeFetch(statuses: number[] = [200]): { fn: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const fn = (async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const status = statuses[Math.min(i++, statuses.length - 1)] ?? 200;
    return { ok: status >= 200 && status < 300, status } as Response;
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const noSleep = async (): Promise<void> => {};

describe('formatDigest', () => {
  it('lists apply link, years and skills, and caps the count', () => {
    const text = formatDigest([job(), job({ id: '2' }), job({ id: '3' })], 2, 'k · l');
    expect(text).toContain('3 new LinkedIn jobs');
    expect(text).toContain('https://careers.example/1');
    expect(text).toContain('3+ yrs · Python, SQL');
    expect(text).toContain('…and 1 more');
  });
  it('escapes HTML for Telegram', () => {
    expect(escapeHtml('<b>&')).toBe('&lt;b&gt;&amp;');
    expect(formatDigest([job()], 5, 'q', escapeHtml)).toContain('Data &lt;Engineer&gt; &amp; Co');
  });
});

describe('sendNotifications', () => {
  it('does nothing when there are no new jobs', async () => {
    const f = fakeFetch();
    const r = await sendNotifications(cfg({ webhookUrl: 'https://x.example' }), [], { queries: 'q' }, { fetch: f.fn, sleep: noSleep, log: silentLog });
    expect(f.calls).toHaveLength(0);
    expect(r).toEqual({ sent: [], failed: [] });
  });

  it('posts to every configured channel with the right payload shape', async () => {
    const f = fakeFetch();
    const r = await sendNotifications(
      cfg({ telegramToken: 'T', telegramChatId: '42', discordWebhookUrl: 'https://d.example/h', slackWebhookUrl: 'https://s.example/h', webhookUrl: 'https://w.example/h' }),
      [job()], { queries: 'q' }, { fetch: f.fn, sleep: noSleep, log: silentLog },
    );
    expect(r.sent).toEqual(['telegram', 'discord', 'slack', 'webhook']);
    expect(f.calls[0]?.url).toBe('https://api.telegram.org/botT/sendMessage');
    expect(f.calls[0]?.body).toMatchObject({ chat_id: '42', parse_mode: 'HTML' });
    expect(f.calls[1]?.body.content).toContain('new LinkedIn job');
    expect(f.calls[2]?.body.text).toContain('new LinkedIn job');
    expect(f.calls[3]?.body).toMatchObject({ source: 'linkedin-job-finder', count: 1 });
    expect(f.calls[3]?.body.items[0].id).toBe('1');
  });

  it('retries on 5xx then succeeds', async () => {
    const f = fakeFetch([500, 200]);
    const r = await sendNotifications(cfg({ slackWebhookUrl: 'https://s.example/h' }), [job()], { queries: 'q' }, { fetch: f.fn, sleep: noSleep, log: silentLog });
    expect(r.sent).toEqual(['slack']);
    expect(f.calls).toHaveLength(2);
  });

  it('reports failure without throwing and never logs secrets', async () => {
    const logs: string[] = [];
    const log = { info: (m: string) => logs.push(m), warning: (m: string) => logs.push(m), debug: (m: string) => logs.push(m) };
    const f = fakeFetch([400]);
    const r = await sendNotifications(cfg({ telegramToken: 'SECRETTOKEN', telegramChatId: '1' }), [job()], { queries: 'q' }, { fetch: f.fn, sleep: noSleep, log });
    expect(r.failed).toEqual(['telegram']);
    expect(logs.join(' ')).not.toContain('SECRETTOKEN');
    expect(f.calls).toHaveLength(1); // 4xx is not retried
  });

  it('survives a network error', async () => {
    const boom = (async () => { throw new Error('https://secret.example exploded'); }) as unknown as typeof fetch;
    const logs: string[] = [];
    const log = { info: (m: string) => logs.push(m), warning: (m: string) => logs.push(m), debug: (m: string) => logs.push(m) };
    const r = await sendNotifications(cfg({ webhookUrl: 'https://secret.example/h' }), [job()], { queries: 'q' }, { fetch: boom, sleep: noSleep, log });
    expect(r.failed).toEqual(['webhook']);
    expect(logs.join(' ')).not.toContain('secret.example');
  });
});
