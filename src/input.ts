import { createHash } from 'node:crypto';
import { z } from 'zod';

export const DATE_POSTED = ['any', '24h', 'week', 'month'] as const;
export const WORK_TYPES = ['onsite', 'remote', 'hybrid'] as const;
export const JOB_TYPES = ['full-time', 'part-time', 'contract', 'temporary', 'internship', 'volunteer', 'other'] as const;
export const EXPERIENCE_LEVELS = ['internship', 'entry', 'associate', 'mid-senior', 'director', 'executive'] as const;
export const SORT_BY = ['recent', 'relevant'] as const;

const cleanList = z
  .array(z.string())
  .transform((arr) => [...new Set(arr.map((s) => s.trim()).filter((s) => s.length > 0))]);

const rawSchema = z.object({
  keywords: cleanList,
  locations: cleanList.optional(),
  datePosted: z.enum(DATE_POSTED).optional(),
  workTypes: z.array(z.enum(WORK_TYPES)).optional(),
  jobTypes: z.array(z.enum(JOB_TYPES)).optional(),
  experienceLevels: z.array(z.enum(EXPERIENCE_LEVELS)).optional(),
  easyApplyOnly: z.boolean().optional(),
  sortBy: z.enum(SORT_BY).optional(),
  maxJobsPerSearch: z.number().int().min(1).max(1000).optional(),
  fetchDetails: z.boolean().optional(),
  titleInclude: cleanList.optional(),
  titleExclude: cleanList.optional(),
  companyExclude: cleanList.optional(),
  incrementalMode: z.boolean().optional(),
  stateKey: z.string().optional(),
  compact: z.boolean().optional(),
  excludeEmptyFields: z.boolean().optional(),
  telegramToken: z.string().optional(),
  telegramChatId: z.string().optional(),
  discordWebhookUrl: z.string().optional(),
  slackWebhookUrl: z.string().optional(),
  webhookUrl: z.string().optional(),
  notificationLimit: z.number().int().min(1).max(20).optional(),
  requestDelayMs: z.number().int().min(300).max(15000).optional(),
  detailConcurrency: z.number().int().min(1).max(5).optional(),
  saveSampleHtml: z.boolean().optional(),
  proxyConfiguration: z.record(z.string(), z.unknown()).optional(),
});

/** Names of every accepted input property (used by a test that keeps .actor/input_schema.json in sync). */
export const INPUT_KEYS: string[] = Object.keys(rawSchema.shape);

export interface NotifyConfig {
  telegramToken: string;
  telegramChatId: string;
  discordWebhookUrl: string;
  slackWebhookUrl: string;
  webhookUrl: string;
  notificationLimit: number;
}

export interface NormalizedInput {
  keywords: string[];
  locations: string[];
  datePosted: (typeof DATE_POSTED)[number];
  workTypes: (typeof WORK_TYPES)[number][];
  jobTypes: (typeof JOB_TYPES)[number][];
  experienceLevels: (typeof EXPERIENCE_LEVELS)[number][];
  easyApplyOnly: boolean;
  sortBy: (typeof SORT_BY)[number];
  maxJobsPerSearch: number;
  fetchDetails: boolean;
  titleInclude: string[];
  titleExclude: string[];
  companyExclude: string[];
  incrementalMode: boolean;
  stateKey: string;
  compact: boolean;
  excludeEmptyFields: boolean;
  notify: NotifyConfig;
  requestDelayMs: number;
  detailConcurrency: number;
  saveSampleHtml: boolean;
  proxyConfiguration: Record<string, unknown> | undefined;
}

function checkHttpUrl(value: string | undefined, field: string): string {
  const v = (value ?? '').trim();
  if (!v) return '';
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new Error(`Invalid input: ${field}: not a valid URL.`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error(`Invalid input: ${field}: must start with http:// or https://.`);
  }
  return v;
}

export function normalizeInput(raw: unknown): NormalizedInput {
  const parsed = rawSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    throw new Error(`Invalid input: ${msg}`);
  }
  const p = parsed.data;
  if (p.keywords.length === 0) {
    throw new Error('Invalid input: keywords: add at least one keyword (for example "data engineer").');
  }
  const telegramToken = (p.telegramToken ?? '').trim();
  const telegramChatId = (p.telegramChatId ?? '').trim();
  if (telegramToken && !telegramChatId) {
    throw new Error('Invalid input: telegramChatId: required when telegramToken is set.');
  }
  return {
    keywords: p.keywords,
    locations: p.locations && p.locations.length > 0 ? p.locations : ['United States'],
    datePosted: p.datePosted ?? 'week',
    workTypes: p.workTypes ?? [],
    jobTypes: p.jobTypes ?? [],
    experienceLevels: p.experienceLevels ?? [],
    easyApplyOnly: p.easyApplyOnly ?? false,
    sortBy: p.sortBy ?? 'recent',
    maxJobsPerSearch: p.maxJobsPerSearch ?? 50,
    fetchDetails: p.fetchDetails ?? true,
    titleInclude: p.titleInclude ?? [],
    titleExclude: p.titleExclude ?? [],
    companyExclude: p.companyExclude ?? [],
    incrementalMode: p.incrementalMode ?? false,
    stateKey: (p.stateKey ?? '').trim(),
    compact: p.compact ?? false,
    excludeEmptyFields: p.excludeEmptyFields ?? false,
    notify: {
      telegramToken,
      telegramChatId,
      discordWebhookUrl: checkHttpUrl(p.discordWebhookUrl, 'discordWebhookUrl'),
      slackWebhookUrl: checkHttpUrl(p.slackWebhookUrl, 'slackWebhookUrl'),
      webhookUrl: checkHttpUrl(p.webhookUrl, 'webhookUrl'),
      notificationLimit: p.notificationLimit ?? 5,
    },
    requestDelayMs: p.requestDelayMs ?? 1500,
    detailConcurrency: p.detailConcurrency ?? 2,
    saveSampleHtml: p.saveSampleHtml ?? false,
    proxyConfiguration: p.proxyConfiguration,
  };
}

/** Stable identifier of the "search universe": same searches share incremental state, different ones never do. */
export function deriveStateKey(i: NormalizedInput): string {
  if (i.stateKey) return i.stateKey;
  const sorted = (a: string[]) => [...a].sort();
  const basis = JSON.stringify({
    k: sorted(i.keywords),
    l: sorted(i.locations),
    d: i.datePosted,
    w: sorted(i.workTypes),
    j: sorted(i.jobTypes),
    e: sorted(i.experienceLevels),
    a: i.easyApplyOnly,
    ti: sorted(i.titleInclude),
    te: sorted(i.titleExclude),
    ce: sorted(i.companyExclude),
  });
  return createHash('sha1').update(basis).digest('hex').slice(0, 16);
}

/** Copy of the input that is safe to print in logs (secrets masked). */
export function sanitizeInputForLog(i: NormalizedInput): Record<string, unknown> {
  const mask = (v: string) => (v ? '***' : '');
  return {
    ...i,
    notify: {
      ...i.notify,
      telegramToken: mask(i.notify.telegramToken),
      discordWebhookUrl: mask(i.notify.discordWebhookUrl),
      slackWebhookUrl: mask(i.notify.slackWebhookUrl),
      webhookUrl: mask(i.notify.webhookUrl),
    },
    proxyConfiguration: i.proxyConfiguration ? '[configured]' : undefined,
  };
}
