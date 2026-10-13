/**
 * Print spike verdict table from docs/spike/<tier>.json
 * Usage: npx tsx scripts/summarize-stats.ts
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface SpikeFile {
  tier: string;
  error?: string | null;
  usageTotalUsd?: number | null;
  durationMs?: number | null;
  stats?: {
    jobsPushed?: number;
    http?: {
      requests?: number;
      statusHistogram?: Record<string, number>;
    };
  } | null;
}

function verdict(rawSuccess: number | null, requests: number): 'PASS' | 'MARGINAL' | 'FAIL' | 'N/A' {
  if (rawSuccess == null || requests < 300) return requests > 0 && rawSuccess != null && rawSuccess < 0.9 ? 'FAIL' : 'N/A';
  if (rawSuccess >= 0.98) return 'PASS';
  if (rawSuccess >= 0.9) return 'MARGINAL';
  return 'FAIL';
}

function load(): SpikeFile[] {
  const dir = 'docs/spike';
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as SpikeFile);
}

function main(): void {
  const rows = load();
  if (rows.length === 0) {
    console.error('No docs/spike/*.json found. Run: npm run spike');
    process.exit(1);
  }
  console.log(
    [
      'tier'.padEnd(18),
      'requests'.padStart(8),
      '200'.padStart(6),
      'rawSuccess'.padStart(10),
      'jobs'.padStart(6),
      'usd'.padStart(8),
      '$/1k'.padStart(8),
      'verdict'.padStart(10),
    ].join(' '),
  );
  for (const r of rows) {
    if (r.error && !r.stats) {
      console.log(`${r.tier.padEnd(18)} ERROR: ${r.error}`);
      continue;
    }
    const requests = r.stats?.http?.requests ?? 0;
    const ok200 = r.stats?.http?.statusHistogram?.['200'] ?? 0;
    const rawSuccess = requests > 0 ? ok200 / requests : null;
    const jobs = r.stats?.jobsPushed ?? 0;
    const usd = r.usageTotalUsd ?? null;
    const per1k = usd != null && jobs > 0 ? (usd / jobs) * 1000 : null;
    const v = verdict(rawSuccess, requests);
    console.log(
      [
        r.tier.padEnd(18),
        String(requests).padStart(8),
        String(ok200).padStart(6),
        (rawSuccess == null ? '-' : (rawSuccess * 100).toFixed(1) + '%').padStart(10),
        String(jobs).padStart(6),
        (usd == null ? '-' : usd.toFixed(4)).padStart(8),
        (per1k == null ? '-' : per1k.toFixed(3)).padStart(8),
        v.padStart(10),
      ].join(' '),
    );
    console.log(`  verdict rule: PASS if requests>=300 and rawSuccess>=98%; MARGINAL 90-98%; FAIL <90%; N/A if <300 requests`);
  }
}

main();
