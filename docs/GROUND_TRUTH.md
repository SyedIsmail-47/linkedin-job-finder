# GROUND TRUTH — real LinkedIn guest HTML (Phase 2)

## Sources

| Fixture | Origin | Notes |
|---|---|---|
| `test/fixtures/real-search-page.html` | Apify KV `SAMPLE_SEARCH_PAGE` from run `AgpgFLGw8jvCUtWJa` (store `LuZETkgFcghbnmLyi`) | Sanitized via `scripts/sanitize-fixture.ts` |
| `test/fixtures/real-detail-1.html` | Apify KV `SAMPLE_DETAIL_PAGE` from same run | Job `4476983365` (JPMorganChase) |
| `test/fixtures/real-detail-2.html` | **Missing** | `scripts/capture.ts --detail-only 4476882191` returned **HTTP 429**; stopped per Rule 2 (no retry). |

Synthetic fixtures in `test/fixtures/search-page.html` and `detail-100000000*.html` remain labeled `<!-- SYNTHETIC FIXTURE: ... -->`.

## Observed vs prior assumptions

| Topic | Assumption (HANDOFF / code comments) | Measured |
|---|---|---|
| Cards per first search page | "10 or 25" | **10** cards from `parseSearchCards(real-search-page.html)` |
| Search selectors | `base-card` / `base-search-card` / `data-entity-urn` | **Work** on real HTML (10 cards with titles, companies, locations) |
| Detail title selector | `h2.top-card-layout__title` | **Works** (`Software Engineer II (Java/AWS)`) |
| Description | `.show-more-less-html__markup` | **Works** (description length 5703 on detail-1) |
| `code#applyUrl` with employer URL | Present on guest pages | **Absent** on detail-1; employer URL gated behind sign-in modal |
| Off-site apply signal | Easy-detect apply link | Modal + `apply-link-offsite` / `apply-button__offsite-apply-icon-svg` present; parser maps to **`EXTERNAL_HIDDEN`** with LinkedIn job URL |
| Easy Apply | Distinct markup | **Not present** on detail-1. Smoke dataset `hm4AuvHLo6ffWFXfY` (30 jobs): `EXTERNAL: 29`, `UNKNOWN: 1`, `EASY_APPLY: 0` |
| Filter `f_TPR` (week) | Unverified | Search sample came from a run with `datePosted: "week"` that returned HTTP 200 and 10 cards — **accepted as working for that capture**. Other filter codes (`f_WT`, `f_JT`, `f_E`, `f_AL`, `sortBy`) **not confirmed** (would need one request each, ≥60s apart; not run in this phase). |

## Capture tooling

- `scripts/capture.ts` — max 5 requests, ≥5s gap, abort on non-200 / auth wall.
- `scripts/sanitize-fixture.ts` — redacts `referenceId` / csrf-style `<code>` blobs and long tracking attributes.

## Open

- Capture `real-detail-2.html` (and ideally an Easy Apply detail) when LinkedIn stops returning 429 from this IP, or via a future Apify run that stores a second sample.
