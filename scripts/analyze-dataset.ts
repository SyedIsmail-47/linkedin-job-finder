/**
 * Summarize a LinkedIn Job Finder dataset JSON file (array or NDJSON).
 * Usage: npx tsx scripts/analyze-dataset.ts <file.json>
 */
import { readFileSync } from 'node:fs';

export interface DatasetItem {
  requirementsSource?: string;
  skills?: unknown;
  minYearsExperience?: number | null;
  applyType?: string;
  detailsFetched?: boolean;
  title?: string | null;
  company?: string | null;
  description?: string | null;
  applyUrl?: string | null;
}

export interface DatasetAnalysis {
  count: number;
  requirementsSource: Record<string, number>;
  pctRequirementsSource: Record<string, number>;
  pctNonEmptySkills: number;
  pctMinYearsSet: number;
  applyType: Record<string, number>;
  pctDetailsFetched: number;
  samples: Array<{ title: string | null; company: string | null; applyType: string | null; applyUrl: string | null; description: string }>;
}

function loadItems(raw: string): DatasetItem[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed) as DatasetItem[];
  return trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as DatasetItem);
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

export function analyzeDataset(items: DatasetItem[]): DatasetAnalysis {
  const requirementsSource: Record<string, number> = {};
  const applyType: Record<string, number> = {};
  let nonEmptySkills = 0;
  let minYearsSet = 0;
  let detailsFetched = 0;

  for (const it of items) {
    const rs = it.requirementsSource ?? 'missing';
    requirementsSource[rs] = (requirementsSource[rs] ?? 0) + 1;
    const at = it.applyType ?? 'missing';
    applyType[at] = (applyType[at] ?? 0) + 1;
    if (Array.isArray(it.skills) && it.skills.length > 0) nonEmptySkills++;
    if (it.minYearsExperience != null) minYearsSet++;
    if (it.detailsFetched) detailsFetched++;
  }

  const count = items.length;
  const pctRequirementsSource: Record<string, number> = {};
  for (const [k, v] of Object.entries(requirementsSource)) pctRequirementsSource[k] = pct(v, count);

  const samples = items.slice(0, 3).map((it) => ({
    title: it.title ?? null,
    company: it.company ?? null,
    applyType: it.applyType ?? null,
    applyUrl: it.applyUrl ?? null,
    description: (it.description ?? '').slice(0, 200),
  }));

  return {
    count,
    requirementsSource,
    pctRequirementsSource,
    pctNonEmptySkills: pct(nonEmptySkills, count),
    pctMinYearsSet: pct(minYearsSet, count),
    applyType,
    pctDetailsFetched: pct(detailsFetched, count),
    samples,
  };
}

function main(): void {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: tsx scripts/analyze-dataset.ts <file.json>');
    process.exit(1);
  }
  const items = loadItems(readFileSync(file, 'utf8'));
  const analysis = analyzeDataset(items);
  console.log(JSON.stringify(analysis, null, 2));
}

const isMain = process.argv[1]?.includes('analyze-dataset');
if (isMain) main();
