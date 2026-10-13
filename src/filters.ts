import type { NormalizedInput } from './input.js';
import type { JobCard } from './types.js';

const has = (haystack: string, needle: string): boolean => haystack.toLowerCase().includes(needle.toLowerCase());

/** Cheap card-level filters, applied BEFORE fetching details so rejected jobs cost nothing. */
export function passesFilters(
  card: Pick<JobCard, 'title' | 'company'>,
  input: Pick<NormalizedInput, 'titleInclude' | 'titleExclude' | 'companyExclude'>,
): boolean {
  const title = card.title ?? '';
  const company = card.company ?? '';
  if (input.titleInclude.length > 0 && !input.titleInclude.some((t) => has(title, t))) return false;
  if (input.titleExclude.some((t) => has(title, t))) return false;
  if (input.companyExclude.some((c) => has(company, c))) return false;
  return true;
}
