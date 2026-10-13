# REVIEW — skeptical audit (Phase 1)

Severity legend: **Critical** (wrong money / secret leak / data loss) · **High** (must fix before 0.2) · **Medium** · **Low**

| Severity | Location | Evidence | Fix |
|---|---|---|---|
| High | `src/pipeline.ts:118-119` | After `charge('job-listed')` returns limit, code still calls `charge('job-enriched')` (`limit = (await deps.charge('job-enriched')) \|\| limit`). Can bill past the user's limit for the same job. | Skip enriched charge when `limit` is already true. |
| High | `src/pipeline.ts:28-28,54-55` | Module-level `const sampled = { search, detail }` mutated across runs. Reset at start of `runPipeline`, but shared mutable module state violates one-run isolation if the process is reused. | Move `sampled` into a local variable inside `runPipeline` / pass through helpers. |
| High | `src/main.ts:50-54,85` + `src/pipeline.ts:129` | Incremental `SeenStore` is saved only on `persistState`, `aborting`, and end of run. A crash mid-run after several completed queries loses all new IDs for those queries. | Save after every completed search query. |
| High | `src/main.ts:114` + `src/billing.ts:25` | Generic error path logs `err.message`. `got-scraping` / proxy failures can embed `http://user:pass@host` in messages if they ever escape the swallowed catch in `http.ts:119`. Telegram bot token lives in the request URL (`notify.ts:77`); current `postJson` catch does not log the message (good), but `billing`/`main` still print raw messages. | Redact credentialed URLs and Telegram bot tokens from logged error strings. |
| Medium | `src/main.ts:66-68` | `emitted.push(item)` runs **before** `Actor.pushData`. If `pushData` throws, notifications never run (run fails), but the in-memory list was briefly inconsistent. | Push to `emitted` only after `pushData` succeeds. |
| Medium | `src/billing.ts` / `src/main.ts` | Planned PPE event `apify-actor-start` is never charged. Only `job-listed` / `job-enriched` exist in `ChargeEvent`. | Add start charge after successful init (manual monetization still off). Defer to release checklist unless product requires it in 0.2 code. |
| Medium | `src/main.ts:58` | `emitted: JobItem[]` retains every job for notifications — unbounded vs `maxJobsPerSearch * keywords * locations`. | Cap notification payload (already has `notificationLimit` for message body; full items still held for webhook). |
| Medium | `src/http.ts` | No `Retry-After` honor; fixed backoff only. Spike run `AgpgFLGw8jvCUtWJa` showed `22x429` / `32x200`. | Phase 4. |
| Medium | `src/parse.ts` `parseApply` | Guest pages gate employer URLs; code marks `EXTERNAL` with LinkedIn job URL. Product wants `EXTERNAL_HIDDEN`. | Phase 3. |
| Medium | `src/urls.ts:6-7` | Filter codes marked UNVERIFIED in source comments. | Phase 2 ground truth. |
| Low | `src/pipeline.ts:66` | Search pagination is bounded by `MAX_START` (1000) and `maxJobsPerSearch` — OK. | None. |
| Low | `src/http.ts:45` | Request timeout 30s present — OK. | None. |
| Low | `src/notify.ts:47-48` | Network errors intentionally not logged (comment cites secret URL risk) — OK. | None. |
| Low | Parsers | Existing test `does not throw on garbage input` for `parseJobDetail`. `parseSearchCards('')` returns `[]`. No evidence of throws on fixtures. | Keep tests; optional try/catch belt. |

## SDK cross-check (installed `apify@3.7.2`)

- `Actor.charge(options: ChargeOptions): Promise<ChargeResult>` — `node_modules/apify/dist/actor.d.ts` (~1327).
- `Actor.on`, `openKeyValueStore`, `createProxyConfiguration` used as in SDK typings; no invented APIs.

## Charging order (verified by reading code)

Pipeline: `await emit(...)` then `jobsPushed++` then `charge`. `main` emit awaits `pushData` before returning. Duplicates / filtered / failed details never reach `emit`/`charge` for enrichment. **No double-charge retry path** (no emit retry loop).
