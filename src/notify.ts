import type { NotifyConfig } from './input.js';
import type { JobItem, Logger } from './types.js';

export interface NotifyDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  log: Logger;
}
export interface NotifyResult {
  sent: string[];
  failed: string[];
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Plain-text digest lines for the first `limit` jobs. `esc` escapes dynamic text for the target format. */
export function formatDigest(items: JobItem[], limit: number, queries: string, esc: (s: string) => string = (s) => s): string {
  const shown = items.slice(0, limit);
  const head = `🔎 ${items.length} new LinkedIn job${items.length === 1 ? '' : 's'} (${esc(queries)})`;
  const body = shown.map((j, i) => {
    const where = j.location ? ` (${esc(j.location)})` : '';
    const needs = [j.minYearsExperience !== null ? `${j.minYearsExperience}+ yrs` : '', j.skills.slice(0, 5).join(', ')]
      .filter(Boolean)
      .join(' · ');
    return `${i + 1}. ${esc(j.title ?? 'Untitled')} — ${esc(j.company ?? 'Unknown company')}${where}\n   ${j.applyUrl ?? j.url}${needs ? `\n   ${esc(needs)}` : ''}`;
  });
  const more = items.length > shown.length ? `\n…and ${items.length - shown.length} more in the dataset.` : '';
  return `${head}\n\n${body.join('\n\n')}${more}`;
}

async function postJson(name: string, url: string, body: unknown, deps: NotifyDeps): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await deps.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) return true;
      if (res.status !== 429 && res.status < 500) {
        deps.log.warning(`Notification to ${name} failed with HTTP ${res.status}.`);
        return false;
      }
    } catch {
      // network error: retry (message deliberately not logged, it could contain the secret URL)
    }
    await deps.sleep(1000 * 2 ** attempt);
  }
  deps.log.warning(`Notification to ${name} failed after retries.`);
  return false;
}

/** Sends one digest per configured channel. Failures are logged (never with secrets) and never fail the run. */
export async function sendNotifications(
  cfg: NotifyConfig,
  items: JobItem[],
  meta: { queries: string },
  deps: Partial<NotifyDeps> & { log: Logger },
): Promise<NotifyResult> {
  const d: NotifyDeps = { fetch: deps.fetch ?? fetch, sleep: deps.sleep ?? defaultSleep, log: deps.log };
  const result: NotifyResult = { sent: [], failed: [] };
  if (items.length === 0) return result;

  const record = (name: string, ok: boolean): void => {
    (ok ? result.sent : result.failed).push(name);
  };

  if (cfg.telegramToken && cfg.telegramChatId) {
    const text = formatDigest(items, cfg.notificationLimit, meta.queries, escapeHtml).slice(0, 4000);
    record(
      'telegram',
      await postJson(
        'telegram',
        `https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`,
        { chat_id: cfg.telegramChatId, text, parse_mode: 'HTML', disable_web_page_preview: true },
        d,
      ),
    );
  }
  if (cfg.discordWebhookUrl) {
    const content = formatDigest(items, cfg.notificationLimit, meta.queries).slice(0, 1900);
    record('discord', await postJson('discord', cfg.discordWebhookUrl, { content }, d));
  }
  if (cfg.slackWebhookUrl) {
    const text = formatDigest(items, cfg.notificationLimit, meta.queries).slice(0, 3500);
    record('slack', await postJson('slack', cfg.slackWebhookUrl, { text }, d));
  }
  if (cfg.webhookUrl) {
    record(
      'webhook',
      await postJson('webhook', cfg.webhookUrl, { source: 'linkedin-job-finder', meta, count: items.length, items }, d),
    );
  }
  return result;
}
