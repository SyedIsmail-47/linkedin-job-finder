import { describe, expect, it } from 'vitest';
import { deriveStateKey, normalizeInput, sanitizeInputForLog } from '../src/input.js';

describe('normalizeInput', () => {
  it('applies sensible defaults', () => {
    const i = normalizeInput({ keywords: ['  data engineer ', 'data engineer', ''] });
    expect(i.keywords).toEqual(['data engineer']);
    expect(i.locations).toEqual(['United States']);
    expect(i.datePosted).toBe('week');
    expect(i.maxJobsPerSearch).toBe(50);
    expect(i.fetchDetails).toBe(true);
    expect(i.incrementalMode).toBe(false);
    expect(i.notify.notificationLimit).toBe(5);
  });

  it('rejects missing keywords with a readable message', () => {
    expect(() => normalizeInput({})).toThrow(/keywords/);
    expect(() => normalizeInput({ keywords: ['  '] })).toThrow(/at least one keyword/);
  });

  it('rejects out-of-range numbers and unknown enum values', () => {
    expect(() => normalizeInput({ keywords: ['a'], maxJobsPerSearch: 5000 })).toThrow(/maxJobsPerSearch/);
    expect(() => normalizeInput({ keywords: ['a'], datePosted: 'yesterday' })).toThrow(/datePosted/);
  });

  it('requires a chat id with a telegram token', () => {
    expect(() => normalizeInput({ keywords: ['a'], telegramToken: 'x' })).toThrow(/telegramChatId/);
  });

  it('rejects non-http webhook URLs', () => {
    expect(() => normalizeInput({ keywords: ['a'], webhookUrl: 'ftp://x.example' })).toThrow(/webhookUrl/);
    expect(() => normalizeInput({ keywords: ['a'], slackWebhookUrl: 'not a url' })).toThrow(/slackWebhookUrl/);
  });
});

describe('deriveStateKey', () => {
  const base = { keywords: ['a', 'b'], locations: ['Berlin', 'Paris'] };
  it('is stable regardless of list order and ignores run-size options', () => {
    const k1 = deriveStateKey(normalizeInput(base));
    const k2 = deriveStateKey(normalizeInput({ keywords: ['b', 'a'], locations: ['Paris', 'Berlin'], maxJobsPerSearch: 10 }));
    expect(k1).toBe(k2);
  });
  it('differs when the search universe differs', () => {
    expect(deriveStateKey(normalizeInput(base))).not.toBe(deriveStateKey(normalizeInput({ ...base, locations: ['Berlin'] })));
  });
  it('honours an explicit state key', () => {
    expect(deriveStateKey(normalizeInput({ ...base, stateKey: 'my-alert' }))).toBe('my-alert');
  });
});

describe('sanitizeInputForLog', () => {
  it('masks every secret', () => {
    const i = normalizeInput({
      keywords: ['a'],
      telegramToken: 'TOKEN123',
      telegramChatId: '42',
      slackWebhookUrl: 'https://hooks.slack.example/SECRET',
      discordWebhookUrl: 'https://discord.example/SECRET2',
      webhookUrl: 'https://n8n.example/SECRET3',
    });
    const text = JSON.stringify(sanitizeInputForLog(i));
    for (const s of ['TOKEN123', 'SECRET', 'SECRET2', 'SECRET3']) expect(text).not.toContain(s);
  });
});

describe('saveSampleHtml', () => {
  it('is off by default and can be enabled', () => {
    expect(normalizeInput({ keywords: ['a'] }).saveSampleHtml).toBe(false);
    expect(normalizeInput({ keywords: ['a'], saveSampleHtml: true }).saveSampleHtml).toBe(true);
  });
});
