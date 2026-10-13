import { extractMinYears, extractRequirements, extractSkills } from './requirements.js';
import type { JobCard, JobDetail, JobItem, SearchQuery } from './types.js';

function detectWorkplace(title: string | null, location: string | null, description: string | null): 'remote' | 'hybrid' | null {
  const head = `${title ?? ''} ${location ?? ''}`;
  if (/\bhybrid\b/i.test(head)) return 'hybrid';
  if (/\bremote\b/i.test(head)) return 'remote';
  const desc = (description ?? '').slice(0, 800);
  if (/\bhybrid\b/i.test(desc)) return 'hybrid';
  if (/\b(fully remote|100% remote|remote[- ]first|work from home)\b/i.test(desc)) return 'remote';
  return null;
}

export function buildItem(card: JobCard, detail: JobDetail | null, query: SearchQuery, scrapedAt: string): JobItem {
  const description = detail?.description ?? null;
  const req = extractRequirements(detail?.descriptionHtml ?? null);
  const title = card.title ?? detail?.title ?? null;
  const location = card.location ?? detail?.location ?? null;
  return {
    id: card.id,
    url: card.url,
    title,
    company: card.company ?? detail?.company ?? null,
    companyUrl: card.companyUrl ?? detail?.companyUrl ?? null,
    location,
    workplaceType: detectWorkplace(title, location, description),
    postedAt: card.postedAt,
    postedAtText: card.postedAtText ?? detail?.postedAtText ?? null,
    salaryText: detail?.salaryText ?? card.salaryText,
    seniorityLevel: detail?.seniorityLevel ?? null,
    employmentType: detail?.employmentType ?? null,
    jobFunction: detail?.jobFunction ?? null,
    industries: detail?.industries ?? null,
    applicantsText: detail?.applicantsText ?? null,
    applyType: detail?.applyType ?? 'UNKNOWN',
    applyUrl: detail?.applyUrl ?? card.url,
    description,
    requirements: req.items,
    requirementsSource: req.source,
    skills: extractSkills([title, description].filter(Boolean).join('\n')),
    minYearsExperience: extractMinYears(req.items.join('\n')) ?? extractMinYears(description),
    detailsFetched: detail !== null,
    searchKeyword: query.keywords,
    searchLocation: query.location,
    scrapedAt,
  };
}

const COMPACT_KEYS: (keyof JobItem)[] = [
  'id',
  'url',
  'title',
  'company',
  'location',
  'workplaceType',
  'postedAt',
  'salaryText',
  'applyType',
  'applyUrl',
  'requirements',
  'skills',
  'minYearsExperience',
];

export interface OutputOptions {
  compact: boolean;
  excludeEmptyFields: boolean;
}

/** Shape an item for the dataset: optional compact mode (no description) and empty-field stripping. */
export function applyOutputOptions(item: JobItem, opts: OutputOptions): Record<string, unknown> {
  let out: Record<string, unknown> = { ...item };
  if (opts.compact) {
    out = {};
    for (const k of COMPACT_KEYS) out[k] = item[k];
  }
  if (opts.excludeEmptyFields) {
    for (const [k, v] of Object.entries(out)) {
      if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete out[k];
    }
  }
  return out;
}
