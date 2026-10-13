/**
 * Print spike verdict table from docs/spike/<tier>.json
 * Usage: npx tsx scripts/summarize-stats.ts
 *
 * NO-GO: write docs/NO-GO.md only when every *runnable* tier FAILs
 * (INCONCLUSIVE / plan-error tiers are ignored for that decision).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export type SpikeVerdict = 'PASS' | 'MARGINAL' | 'FAIL' | 'INCONCLUSIVE';

export interface SpikeStatsLike {
  jobsPushed?: number;
  detailsOk?: number;
  detailFailures?: number;
  abortedReason?: string | null;
  durationMs?: number;
  http?: {
    requests?: number;
    statusHistogram?: Record<string, number>;
  };
}

export interface SpikeFile {
  tier: string;
  error?: string | null;
  usageTotalUsd?: number | null;
  durationMs?: number | null;
  requestedJobs?: number | null;
  stats?: SpikeStatsLike | null;
}

export interface SpikeMetrics {
  requestedJobs: number;
  jobsPushed: number;
  jobYield: number | null;
  detailsOk: number;
  detailFailures: number;
  detailSuccess: number | null;
  requests: number;
  rawSuccess: number | null;
  blockedShare: number | null;
  msPer1000Jobs: number | null;
  costPer1000: number | null;
  abortedReason: string | null;
}

const PLAN_ERROR_RE =
  /RESIDENTIAL|proxy group|not (?:available|included|allowed)|upgrade|your plan|plan does not|Insufficient|PROXY_GROUP|forbidden.*proxy/i;

export function isPlanError(error: string | null | undefined): boolean {
  return Boolean(error && PLAN_ERROR_RE.test(error));
}

export function computeSpikeMetrics(file: SpikeFile): SpikeMetrics {
  const stats = file.stats ?? {};
  const hist = stats.http?.statusHistogram ?? {};
  const requests = stats.http?.requests ?? 0;
  const ok200 = hist['200'] ?? 0;
  const blocked = (hist['429'] ?? 0) + (hist['999'] ?? 0) + (hist['403'] ?? 0);
  const jobsPushed = stats.jobsPushed ?? 0;
  const detailsOk = stats.detailsOk ?? 0;
  const detailFailures = stats.detailFailures ?? 0;
  const detailTotal = detailsOk + detailFailures;
  const requestedJobs = file.requestedJobs ?? 0;
  const durationMs = file.durationMs ?? stats.durationMs ?? null;
  const usd = file.usageTotalUsd ?? null;

  return {
    requestedJobs,
    jobsPushed,
    jobYield: requestedJobs > 0 ? jobsPushed / requestedJobs : null,
    detailsOk,
    detailFailures,
    detailSuccess: detailTotal > 0 ? detailsOk / detailTotal : null,
    requests,
    rawSuccess: requests > 0 ? ok200 / requests : null,
    blockedShare: requests > 0 ? blocked / requests : null,
    msPer1000Jobs: durationMs != null && jobsPushed > 0 ? (durationMs / jobsPushed) * 1000 : null,
    costPer1000: usd != null && jobsPushed > 0 ? (usd / jobsPushed) * 1000 : null,
    abortedReason: stats.abortedReason ?? null,
  };
}

/**
 * PASS: jobYield>=0.95, detailSuccess>=0.95, no abortedReason, blockedShare<=0.25
 * MARGINAL: jobYield>=0.80 and no abortedReason
 * FAIL otherwise
 * INCONCLUSIVE: plan/proxy entitlement errors (no runnable stats)
 */
export function evaluateSpikeTier(file: SpikeFile): SpikeVerdict {
  if (file.error && !file.stats) {
    return isPlanError(file.error) ? 'INCONCLUSIVE' : 'FAIL';
  }
  if (file.error && isPlanError(file.error) && (file.stats?.jobsPushed ?? 0) === 0) {
    return 'INCONCLUSIVE';
  }

  const m = computeSpikeMetrics(file);
  const noAbort = !m.abortedReason;
  const yieldOk = m.jobYield != null && m.jobYield >= 0.95;
  const detailOk = m.detailSuccess != null && m.detailSuccess >= 0.95;
  const blockOk = m.blockedShare != null && m.blockedShare <= 0.25;

  if (yieldOk && detailOk && noAbort && blockOk) return 'PASS';
  if (m.jobYield != null && m.jobYield >= 0.8 && noAbort) return 'MARGINAL';
  return 'FAIL';
}

/** Write NO-GO.md only when every runnable tier FAILs (ignore INCONCLUSIVE). */
export function shouldWriteNoGo(verdicts: SpikeVerdict[]): boolean {
  const runnable = verdicts.filter((v) => v !== 'INCONCLUSIVE');
  return runnable.length > 0 && runnable.every((v) => v === 'FAIL');
}

export function applyNoGoDecision(dir: string, verdicts: SpikeVerdict[]): 'wrote' | 'removed' | 'none' {
  const path = join(dir, 'NO-GO.md');
  if (shouldWriteNoGo(verdicts)) {
    writeFileSync(
      path,
      [
        '# NO-GO',
        '',
        'Every runnable spike tier **FAILED** the yield/detail/block criteria.',
        '',
        'INCONCLUSIVE (plan/proxy) tiers were ignored for this decision.',
        '',
        'Do not publish this Actor. Prefer another product (courier-tracker or Ideas-page pick).',
        '',
      ].join('\n'),
      'utf8',
    );
    return 'wrote';
  }
  if (existsSync(path)) {
    unlinkSync(path);
    return 'removed';
  }
  return 'none';
}

function fmtPct(n: number | null): string {
  return n == null ? '-' : `${(n * 100).toFixed(1)}%`;
}

function load(dir = 'docs/spike'): SpikeFile[] {
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
      'yield'.padStart(8),
      'detail'.padStart(8),
      'raw200'.padStart(8),
      'blocked'.padStart(8),
      'ms/1k'.padStart(10),
      '$/1k'.padStart(8),
      'verdict'.padStart(12),
    ].join(' '),
  );

  const verdicts: SpikeVerdict[] = [];
  for (const r of rows) {
    const v = evaluateSpikeTier(r);
    verdicts.push(v);
    if (v === 'INCONCLUSIVE') {
      console.log(`${r.tier.padEnd(18)} INCONCLUSIVE: ${r.error}`);
      continue;
    }
    const m = computeSpikeMetrics(r);
    console.log(
      [
        r.tier.padEnd(18),
        fmtPct(m.jobYield).padStart(8),
        fmtPct(m.detailSuccess).padStart(8),
        fmtPct(m.rawSuccess).padStart(8),
        fmtPct(m.blockedShare).padStart(8),
        (m.msPer1000Jobs == null ? '-' : Math.round(m.msPer1000Jobs).toString()).padStart(10),
        (m.costPer1000 == null ? '-' : m.costPer1000.toFixed(3)).padStart(8),
        v.padStart(12),
      ].join(' '),
    );
  }

  console.log('');
  console.log(
    'PASS: jobYield>=95%, detailSuccess>=95%, no abortedReason, blockedShare<=25%. MARGINAL: jobYield>=80% and no abortedReason. FAIL otherwise. Plan errors=INCONCLUSIVE.',
  );
  console.log('rawSuccess (200/requests) is informational only.');

  const decision = applyNoGoDecision('docs', verdicts);
  if (decision === 'wrote') console.log('Wrote docs/NO-GO.md (every runnable tier FAILED).');
  else if (decision === 'removed') console.log('Removed docs/NO-GO.md (not all runnable tiers FAILED).');
  else console.log('No NO-GO.md change (need at least one FAIL-only runnable set to write it).');
}

const isMain = process.argv[1]?.includes('summarize-stats');
if (isMain) main();
