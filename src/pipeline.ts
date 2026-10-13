import type { SeenLike } from './dedupe.js';
import { passesFilters } from './filters.js';
import { BlockedError, type HttpClient } from './http.js';
import type { NormalizedInput } from './input.js';
import { buildItem } from './item.js';
import { parseJobDetail, parseSearchCards } from './parse.js';
import type { JobCard, JobDetail, JobItem, Logger, RunStats } from './types.js';
import { buildDetailUrl, buildQueries, buildSearchUrl, canonicalJobUrl } from './urls.js';

export type ChargeEvent = 'job-listed' | 'job-enriched';

export interface PipelineDeps {
  http: HttpClient;
  seen: SeenLike | null;
  /** Push one finished item to the dataset (and remember it for notifications). */
  emit: (item: JobItem) => Promise<void>;
  /** Charge one event. Resolves true when the user's charge limit has been reached. */
  charge: (event: ChargeEvent) => Promise<boolean>;
  log: Logger;
  now?: () => Date;
  /** Optional: receives the first raw search page and first raw detail page (for capturing real fixtures). */
  sample?: (kind: 'search' | 'detail', body: string) => Promise<void>;
  /** Called after each keyword×location search finishes (successful or empty). Use to persist incremental state. */
  onQueryDone?: () => Promise<void>;
}

/** LinkedIn's guest search stops returning results at roughly this offset. */
export const MAX_START = 1000;

type SampleFlags = { search: boolean; detail: boolean };

async function fetchDetail(
  id: string,
  deps: PipelineDeps,
  stats: RunStats,
  sampled: SampleFlags,
): Promise<JobDetail | null> {
  const res = await deps.http.get(buildDetailUrl(id));
  if (res.status !== 200) {
    stats.detailFailures++;
    return null;
  }
  if (deps.sample && !sampled.detail) {
    sampled.detail = true;
    await deps.sample('detail', res.body);
  }
  const detail = parseJobDetail(res.body, canonicalJobUrl(id));
  if (!detail.title && !detail.description) {
    stats.detailFailures++;
    return null;
  }
  stats.detailsOk++;
  return detail;
}

/**
 * search -> dedupe -> card filters -> details -> build item -> emit -> charge.
 * Stops early (keeping everything already emitted) on a block abort or when the charge limit is hit.
 */
export async function runPipeline(input: NormalizedInput, deps: PipelineDeps, stats: RunStats): Promise<void> {
  const sampled: SampleFlags = { search: false, detail: false };
  const now = deps.now ?? (() => new Date());
  const seenThisRun = new Set<string>();
  try {
    for (const query of buildQueries(input)) {
      if (stats.stoppedByChargeLimit) return;
      deps.log.info(`Searching "${query.keywords}" in "${query.location}"`);
      let collected = 0;
      let start = 0;
      let stalePages = 0;

      while (collected < input.maxJobsPerSearch && start < MAX_START) {
        const res = await deps.http.get(buildSearchUrl(query, input, start));
        stats.searchPages++;
        if (res.status !== 200) {
          deps.log.warning(`Search page returned HTTP ${res.status}; moving on.`);
          break;
        }
        if (deps.sample && !sampled.search) {
          sampled.search = true;
          await deps.sample('search', res.body);
        }
        const cards = parseSearchCards(res.body);
        stats.cardsSeen += cards.length;
        if (cards.length === 0) break;
        start += cards.length;

        let newInRun = 0;
        const fresh: JobCard[] = [];
        for (const card of cards) {
          if (seenThisRun.has(card.id)) {
            stats.duplicatesInRun++;
            continue;
          }
          seenThisRun.add(card.id);
          newInRun++;
          if (deps.seen?.has(card.id)) {
            stats.skippedSeen++;
            continue;
          }
          if (!passesFilters(card, input)) {
            stats.filteredOut++;
            continue;
          }
          fresh.push(card);
        }
        stalePages = newInRun === 0 ? stalePages + 1 : 0;

        const batch = fresh.slice(0, input.maxJobsPerSearch - collected);
        const size = input.fetchDetails ? input.detailConcurrency : Math.max(1, batch.length);
        for (let i = 0; i < batch.length; i += size) {
          const chunk = batch.slice(i, i + size);
          const details = input.fetchDetails
            ? await Promise.all(chunk.map((c) => fetchDetail(c.id, deps, stats, sampled)))
            : chunk.map(() => null);
          for (let j = 0; j < chunk.length; j++) {
            const card = chunk[j];
            if (!card) continue;
            const detail = details[j] ?? null;
            await deps.emit(buildItem(card, detail, query, now().toISOString()));
            stats.jobsPushed++;
            collected++;
            deps.seen?.add(card.id);
            let limit = await deps.charge('job-listed');
            if (detail && !limit) limit = await deps.charge('job-enriched');
            if (limit) {
              stats.stoppedByChargeLimit = true;
              deps.log.warning('Charge limit reached: stopping early. Results so far are kept.');
              await deps.onQueryDone?.();
              return;
            }
          }
        }
        if (stalePages >= 2) break;
      }
      deps.log.info(`"${query.keywords}" / "${query.location}": ${collected} job(s) collected.`);
      await deps.onQueryDone?.();
    }
  } catch (err) {
    if (err instanceof BlockedError) {
      stats.abortedReason = err.message;
      deps.log.warning(`Stopping early: ${err.message}`);
      return;
    }
    throw err;
  }
}
