# HANDOFF: LinkedIn Job Finder v0.1

## Status: honest version

| Area | State |
|---|---|
| Code, tests, build | Done. 80 tests pass, `tsc` clean, compiled `dist/` runs end to end in mock mode. |
| Parsing of **real** LinkedIn pages | **NOT VERIFIED.** The sandbox that built this cannot reach LinkedIn. Selectors and filter codes follow public descriptions from other open-source scrapers. Fixtures in `test/fixtures` are **synthetic**. |
| Proxy tier, success rate, cost per 1,000 jobs | **NOT MEASURED.** This is the Go/No-go question (below). |
| Pay-per-event charging | Written against SDK 3.7.2 (`Actor.charge`). Can only be tested on the platform. |
| Notifications | Unit-tested with a fake `fetch`. Never run against real Telegram/Slack/Discord. |

## 1. Run it locally (Windows/macOS/Linux)

```bash
npm install
npm test            # 80 tests
npm run typecheck
npm run mock        # runs the whole Actor on the synthetic fixtures, no network
```

`npm run mock` reads `test/mock-input.json` and writes to `./storage`.

## 2. The feasibility spike (do this BEFORE pricing or publishing)

Push the Actor (`apify login`, `apify push`) and make 3 runs with this input, changing only the proxy:

```json
{
  "keywords": ["software engineer"],
  "locations": ["United States"],
  "maxJobsPerSearch": 150,
  "fetchDetails": true,
  "saveSampleHtml": true,
  "requestDelayMs": 1500
}
```

| Run | Proxy setting |
|---|---|
| A | `{"useApifyProxy": false}` |
| B | `{"useApifyProxy": true}` (datacenter) |
| C | `{"useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"]}` (needs a plan that includes it) |

Each run makes roughly 150 detail requests plus search pages, which is about 300 or more requests in total. After each run open the key-value store record **STATS** and write down:

- `http.statusHistogram` (how many 200 / 429 / 999 / 403)
- `http.blocked`, `http.sessionsRetired`, `abortedReason`
- `jobsPushed`, `detailsOk`, `detailFailures`
- Run cost and duration (Console, Usage)

**Go/No-go rule (proposed):** continue only if success rate is at least 98% over at least 300 requests at some tier, AND measured platform cost per 1,000 enriched jobs is at most 40% of the price you plan to charge for them. If no tier passes, do not publish this Actor. Switch to the courier-tracker or an Ideas-page pick.

## 3. Replace synthetic fixtures with real ones (same runs)

Because `saveSampleHtml` was on, download `SAMPLE_SEARCH_PAGE` and `SAMPLE_DETAIL_PAGE` from the key-value store. Check what is different from `test/fixtures`:

1. Do `parseSearchCards` and `parseJobDetail` return the right fields? Save the real files as `test/fixtures/real-search-page.html` / `real-detail.html` and add tests that assert on them.
2. Is the apply link (`applyUrl`) correct for an external job? How does an Easy Apply job look? (`applyType` detection is the most speculative part.)
3. Do the filter codes (`f_TPR`, `f_WT`, `f_JT`, `f_E`, `f_AL`, `sortBy`) actually filter? Compare result sets with and without each filter.
4. Is the first page 10 or 25 cards? (The code advances by the number of cards received, so either is fine.)

Remove names or personal data from any HTML you commit or share.

## 4. Pricing (set only after the spike)

Define the events in Console, Monetization tab, with these exact names: `apify-actor-start`, `job-listed`, `job-enriched`.

Starting hypotheses (assumptions, not research results): job-listed about $0.0005, job-enriched about $0.0015 (about $2 per 1,000 enriched jobs), start about $0.005. For context, we saw raw LinkedIn scrapers listed at roughly $0.3-0.4 per 1,000 jobs, so compete on output quality, not price. Monetization changes are limited to about once a month, so do not publish prices until the spike numbers are in.

## 5. Publish checklist

- Memory 256 MB in Console, Settings (HTTP-only Actor).
- Categories: Jobs, Lead generation, Automation. Add an icon.
- README is ready; add real screenshots of the dataset view after the first good run.
- Stage it privately for about 48 hours before making it public.
- Ship the n8n node with Apify's Actor-to-n8n-node generator once the Actor is stable.
- Answer issues the same day. Fresh reviews matter.

## 6. Roadmap (reuse this engine)

1. **Hiring Signals Actor**: company-level rollup (who is hiring, how many roles, how recent). Higher price per record, no personal data. Reuses `urls`, `parse`, `http`, `dedupe`.
2. Query segmentation to go beyond the ~1,000-per-search cap (split by date window x workplace type x level).
3. AI match scoring against a pasted resume (separate event).
4. Standby (HTTP) mode for sub-10-second API-style calls from Make.

## 7. Known limitations of this build

- `globalThis`-level state: none, except `pipeline.ts` keeps per-run sample flags in a module variable (reset at the start of each run). Fine for one run per process, which is how Apify works.
- Incremental state is one KV record (`SEEN`) pruned to 60 days. Fine up to roughly 100K job IDs; shard it if a single state key grows far beyond that.
- Detail fetches run 2 at a time on purpose; raising concurrency raises the block risk.
