import { existsSync, readFileSync } from 'node:fs';
import { Actor, log } from 'apify';
import { Billing } from './billing.js';
import { SeenStore, storeNameFor } from './dedupe.js';
import { LinkedInHttp, type HttpClient } from './http.js';
import { deriveStateKey, normalizeInput, sanitizeInputForLog, type NormalizedInput } from './input.js';
import { applyOutputOptions } from './item.js';
import { sendNotifications } from './notify.js';
import { runPipeline } from './pipeline.js';
import { newHttpStats, newRunStats, type JobItem } from './types.js';

/** An error whose message is meant for the user (shown as the run's failure reason). */
class UserError extends Error {}

async function run(): Promise<void> {
  const mock = Boolean(process.env.LJF_MOCK);
  const raw: unknown =
    mock && existsSync('test/mock-input.json')
      ? JSON.parse(readFileSync('test/mock-input.json', 'utf8'))
      : await Actor.getInput();

  let input: NormalizedInput;
  try {
    input = normalizeInput(raw);
  } catch (err) {
    throw new UserError(err instanceof Error ? err.message : 'Invalid input.');
  }
  log.info(`Input: ${JSON.stringify(sanitizeInputForLog(input))}`);

  const httpStats = newHttpStats();
  const stats = newRunStats(httpStats);

  let http: HttpClient;
  if (mock) {
    const { MockHttpClient } = await import('./mock.js');
    http = new MockHttpClient(process.env.LJF_FIXTURES ?? 'test/fixtures');
    log.warning('MOCK MODE: serving local fixtures, LinkedIn is not contacted.');
  } else {
    const proxy = input.proxyConfiguration ? await Actor.createProxyConfiguration(input.proxyConfiguration) : undefined;
    http = new LinkedInHttp({ proxy, delayMs: input.requestDelayMs, stats: httpStats });
  }

  let seen: SeenStore | null = null;
  if (input.incrementalMode) {
    const stateKey = deriveStateKey(input);
    const store = await Actor.openKeyValueStore(storeNameFor(stateKey));
    seen = new SeenStore(store);
    await seen.load();
    log.info(`Incremental mode ON (state "${stateKey}"): ${seen.size} job(s) already known will be skipped.`);
    const persist = async (): Promise<void> => {
      await seen?.save();
    };
    Actor.on('persistState', persist);
    Actor.on('aborting', persist);
  }

  const billing = new Billing(log);
  const emitted: JobItem[] = [];

  await runPipeline(
    input,
    {
      http,
      seen,
      log,
      emit: async (item) => {
        emitted.push(item);
        await Actor.pushData(applyOutputOptions(item, { compact: input.compact, excludeEmptyFields: input.excludeEmptyFields }));
      },
      sample: input.saveSampleHtml
        ? async (kind, body) => {
            const key = kind === 'search' ? 'SAMPLE_SEARCH_PAGE' : 'SAMPLE_DETAIL_PAGE';
            await Actor.setValue(key, body, { contentType: 'text/html; charset=utf-8' });
            log.info(`Saved ${kind} sample HTML to key-value store record ${key}.`);
          }
        : undefined,
      charge: async (event) => {
        await billing.charge(event);
        return billing.limitReached;
      },
    },
    stats,
  );

  await seen?.save();

  const queries = input.keywords.join(', ') + ' · ' + input.locations.join(', ');
  const notifications = await sendNotifications(input.notify, emitted, { queries }, { log });

  await Actor.setValue('STATS', { ...stats, charged: billing.charged, notifications });
  log.info(`Done: ${JSON.stringify({ ...stats, http: undefined })}`);
  log.info(`HTTP: ${JSON.stringify(httpStats)}`);

  if (stats.jobsPushed === 0 && stats.abortedReason) {
    // Fail fast and loudly: nothing was delivered, nothing was charged.
    throw new UserError(`No jobs collected. ${stats.abortedReason}`);
  }
  const summary =
    stats.jobsPushed === 0
      ? input.incrementalMode
        ? `No new jobs since the last run (${stats.skippedSeen} already seen).`
        : 'No jobs matched your search.'
      : `Collected ${stats.jobsPushed} job(s)${stats.stoppedByChargeLimit ? ' (stopped at your charge limit)' : ''}${
          stats.abortedReason ? ' (stopped early: LinkedIn blocked requests)' : ''
        }.`;
  await Actor.setStatusMessage(summary);
}

await Actor.init();
try {
  await run();
  await Actor.exit();
} catch (err) {
  const message = err instanceof UserError ? err.message : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
  log.error(message);
  await Actor.fail(message);
}
