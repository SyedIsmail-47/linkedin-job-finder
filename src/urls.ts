import type { NormalizedInput } from './input.js';
import type { SearchQuery } from './types.js';

const BASE = 'https://www.linkedin.com';

// NOTE: these filter codes follow what other open-source LinkedIn guest-search clients use.
// They are UNVERIFIED against live responses from this project: confirm them on the first platform run.
const DATE_CODES: Record<string, string> = { '24h': 'r86400', week: 'r604800', month: 'r2592000' };
const WORK_CODES: Record<string, string> = { onsite: '1', remote: '2', hybrid: '3' };
const JOB_TYPE_CODES: Record<string, string> = {
  'full-time': 'F',
  'part-time': 'P',
  contract: 'C',
  temporary: 'T',
  internship: 'I',
  volunteer: 'V',
  other: 'O',
};
const EXPERIENCE_CODES: Record<string, string> = {
  internship: '1',
  entry: '2',
  associate: '3',
  'mid-senior': '4',
  director: '5',
  executive: '6',
};

export type SearchFilters = Pick<
  NormalizedInput,
  'datePosted' | 'workTypes' | 'jobTypes' | 'experienceLevels' | 'easyApplyOnly' | 'sortBy'
>;

export function buildSearchUrl(query: SearchQuery, filters: SearchFilters, start: number): string {
  const p = new URLSearchParams();
  p.set('keywords', query.keywords);
  p.set('location', query.location);
  p.set('start', String(Math.max(0, Math.floor(start))));
  const tpr = DATE_CODES[filters.datePosted];
  if (tpr) p.set('f_TPR', tpr);
  if (filters.workTypes.length) p.set('f_WT', filters.workTypes.map((w) => WORK_CODES[w]).filter(Boolean).join(','));
  if (filters.jobTypes.length) p.set('f_JT', filters.jobTypes.map((j) => JOB_TYPE_CODES[j]).filter(Boolean).join(','));
  if (filters.experienceLevels.length) {
    p.set('f_E', filters.experienceLevels.map((e) => EXPERIENCE_CODES[e]).filter(Boolean).join(','));
  }
  if (filters.easyApplyOnly) p.set('f_AL', 'true');
  p.set('sortBy', filters.sortBy === 'recent' ? 'DD' : 'R');
  return `${BASE}/jobs-guest/jobs/api/seeMoreJobPostings/search?${p.toString()}`;
}

export function buildDetailUrl(id: string): string {
  return `${BASE}/jobs-guest/jobs/api/jobPosting/${encodeURIComponent(id)}`;
}

export function canonicalJobUrl(id: string): string {
  return `${BASE}/jobs/view/${encodeURIComponent(id)}`;
}

export function buildQueries(input: Pick<NormalizedInput, 'keywords' | 'locations'>): SearchQuery[] {
  const out: SearchQuery[] = [];
  for (const keywords of input.keywords) {
    for (const location of input.locations) out.push({ keywords, location });
  }
  return out;
}
