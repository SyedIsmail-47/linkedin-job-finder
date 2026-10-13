/**
 * Run the four spike inputs sequentially against the deployed Actor.
 * Requires APIFY_TOKEN in the environment (never logged).
 * Aborts unless the Actor's latest/default build status is SUCCEEDED.
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

export function requestedJobsFromInput(input: Record<string, unknown>): number {
  const keywords = Array.isArray(input.keywords) ? input.keywords.length : 0;
  const locations = Array.isArray(input.locations) ? input.locations.length : 0;
  const max = typeof input.maxJobsPerSearch === 'number' ? input.maxJobsPerSearch : 0;
  return max * Math.max(1, keywords) * Math.max(1, locations);
}

async function requireSucceededBuild(client: ApifyClient): Promise<{
  buildId: string;
  buildNumber: string;
  buildVersion: string | null;
  buildStatus: string;
}> {
  const actorClient = client.actor(ACTOR_ID);
  const actor = await actorClient.get();
  const buildClient = await actorClient.defaultBuild();
  const build = await buildClient.get();
  if (!build) {
    throw new Error(`No default build found for Actor ${ACTOR_ID}. Push a build first.`);
  }
  if (build.status !== 'SUCCEEDED') {
    throw new Error(
      `Actor latest/default build is ${build.status}, not SUCCEEDED (buildNumber=${build.buildNumber}, id=${build.id}). Aborting spike.`,
    );
  }
  const tagged = actor?.taggedBuilds?.latest as { buildNumber?: string; buildId?: string } | undefined;
  const buildVersion =
    (actor?.versions ?? []).find((v) => v.buildTag === 'latest')?.versionNumber ??
    actor?.versions?.[0]?.versionNumber ??
    null;
  return {
    buildId: build.id,
    buildNumber: build.buildNumber ?? tagged?.buildNumber ?? 'unknown',
    buildVersion,
    buildStatus: build.status,
  };
}

async function runTier(
  client: ApifyClient,
  tier: (typeof TIERS)[number],
  build: Awaited<ReturnType<typeof requireSucceededBuild>>,
): Promise<void> {
  const actor = client.actor(ACTOR_ID);
  const inputPath = join('scripts/spike/inputs', `${tier}.json`);
  const input = JSON.parse(readFileSync(inputPath, 'utf8')) as Record<string, unknown>;
  const proxyConfiguration = (input.proxyConfiguration ?? null) as Record<string, unknown> | null;
  const requestedJobs = requestedJobsFromInput(input);
  console.log(`\n=== Starting tier: ${tier} (requestedJobs=${requestedJobs}) ===`);
  try {
    const run = await actor.start(input, { memory: 256, timeout: 3600 });
    console.log(`Run started: ${run.id} status=${run.status}`);
    const finished = await client.run(run.id).waitForFinish({ waitSecs: 3600 });
    const storeId = finished.defaultKeyValueStoreId;
    const statsRecord = storeId ? await client.keyValueStore(storeId).getRecord('STATS') : null;
    const durationMs =
      finished.startedAt && finished.finishedAt
        ? new Date(finished.finishedAt).getTime() - new Date(finished.startedAt).getTime()
        : null;
    const out = {
      tier,
      buildId: build.buildId,
      buildNumber: build.buildNumber,
      buildVersion: build.buildVersion,
      buildStatus: build.buildStatus,
      runId: finished.id,
      status: finished.status,
      startedAt: finished.startedAt,
      finishedAt: finished.finishedAt,
      durationMs,
      proxyConfiguration,
      requestedJobs,
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
      JSON.stringify(
        {
          tier,
          buildId: build.buildId,
          buildNumber: build.buildNumber,
          buildVersion: build.buildVersion,
          buildStatus: build.buildStatus,
          proxyConfiguration,
          requestedJobs,
          error: message,
          usageTotalUsd: null,
          stats: null,
        },
        null,
        2,
      ),
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
  let build: Awaited<ReturnType<typeof requireSucceededBuild>>;
  try {
    build = await requireSucceededBuild(client);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
  console.log(
    `Using SUCCEEDED build ${build.buildNumber} (version=${build.buildVersion ?? 'n/a'}, id=${build.buildId})`,
  );

  for (let i = 0; i < TIERS.length; i++) {
    const tier = TIERS[i]!;
    await runTier(client, tier, build);
    if (i < TIERS.length - 1) {
      console.log(`Pausing ${PAUSE_MS / 1000}s before next tier...`);
      await sleep(PAUSE_MS);
    }
  }
  console.log('\nSpike complete. Run: npm run summarize');
}

const isMain = process.argv[1]?.includes('run-spike');
if (isMain) await main();
