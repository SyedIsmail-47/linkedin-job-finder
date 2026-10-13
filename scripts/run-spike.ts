/**
 * Run the four spike inputs sequentially against the deployed Actor.
 * Requires APIFY_TOKEN in the environment (never logged).
 *
 * Usage: npx tsx scripts/run-spike.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApifyClient } from 'apify-client';

const ACTOR_ID = process.env.LJF_ACTOR_ID ?? 'KatXZ5EirXwpPsyTx';
const PAUSE_MS = 120_000;
const TIERS = ['no-proxy', 'datacenter', 'residential', 'slow-datacenter'] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runTier(client: ApifyClient, tier: (typeof TIERS)[number]): Promise<void> {
  const actor = client.actor(ACTOR_ID);
  const inputPath = join('scripts/spike/inputs', `${tier}.json`);
  const input = JSON.parse(readFileSync(inputPath, 'utf8')) as Record<string, unknown>;
  console.log(`\n=== Starting tier: ${tier} ===`);
  try {
    const run = await actor.start(input, { memory: 256, timeout: 3600 });
    console.log(`Run started: ${run.id} status=${run.status}`);
    const finished = await client.run(run.id).waitForFinish({ waitSecs: 3600 });
    const statsRecord = await client.keyValueStore(finished.defaultKeyValueStoreId!).getRecord('STATS');
    const out = {
      tier,
      runId: finished.id,
      status: finished.status,
      startedAt: finished.startedAt,
      finishedAt: finished.finishedAt,
      durationMs:
        finished.startedAt && finished.finishedAt
          ? new Date(finished.finishedAt).getTime() - new Date(finished.startedAt).getTime()
          : null,
      usageTotalUsd: finished.usageTotalUsd ?? null,
      usage: finished.usage ?? null,
      stats: statsRecord?.value ?? null,
      error: finished.status === 'SUCCEEDED' ? null : `Run ended with status ${finished.status}`,
    };
    mkdirSync('docs/spike', { recursive: true });
    writeFileSync(join('docs/spike', `${tier}.json`), JSON.stringify(out, null, 2));
    console.log(`Wrote docs/spike/${tier}.json usageTotalUsd=${out.usageTotalUsd} status=${out.status}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    mkdirSync('docs/spike', { recursive: true });
    writeFileSync(
      join('docs/spike', `${tier}.json`),
      JSON.stringify({ tier, error: message, usageTotalUsd: null, stats: null }, null, 2),
    );
    console.error(`Tier ${tier} failed (recorded): ${message}`);
  }
}

async function main(): Promise<void> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error('APIFY_TOKEN is not set. Export it, then re-run: npm run spike');
    process.exit(1);
  }
  const client = new ApifyClient({ token });
  for (let i = 0; i < TIERS.length; i++) {
    const tier = TIERS[i]!;
    await runTier(client, tier);
    if (i < TIERS.length - 1) {
      console.log(`Pausing ${PAUSE_MS / 1000}s before next tier...`);
      await sleep(PAUSE_MS);
    }
  }
  console.log('\nSpike complete. Run: npm run summarize');
}

await main();
