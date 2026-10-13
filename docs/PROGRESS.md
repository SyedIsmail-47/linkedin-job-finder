# PROGRESS — release/0.2

## Phase 0 — ORIENT — PASS

### Repo notes vs prompt
- Extracted zip had **no git history**. Initialized new repo on branch `release/0.2`.
- HANDOFF.md says "80 tests"; suite was **81** at baseline (gated-offsite apply test from 0.1.2 work).
- Local Node is **v24.18.0**; Actor Dockerfile targets **Node 22** (`apify/actor-node:22`).
- `.env` already in `.gitignore`.
- Actor already deployed as `rodexco/linkedin-job-finder` / `KatXZ5EirXwpPsyTx` build 0.1.2.

### Commands and results

| Command | Exit | Evidence |
|---|---|---|
| `git init -b release/0.2` | 0 | `Initialized empty Git repository ... on release/0.2` |
| `npm ci` | 0 | `added 255 packages, and audited 256 packages in 19s` |
| `npm run typecheck` | 0 | `tsc --noEmit` (no errors) |
| `npm test` | 0 | `Tests  81 passed (81)` |
| `npm run build` | 0 | `tsc` completed |
| `npm run mock` | 0 | `MOCK MODE... Done: ... cardsSeen:4 ... skippedSeen:3` |

### Note
`docs/PROGRESS.md` missed the phase-0 commit (write/add race); included from phase-1 onward.

---

## Phase 1 — SKEPTICAL AUDIT — PASS

### Deliverables
- `docs/REVIEW.md` — severity table.
- High fixes: charge limit skip for enriched; per-run `sampled`; `onQueryDone` persist; `sanitizeErrorMessage` on logs/fail; emit only pushes to `emitted` after `pushData`.

### Commands and results

| Command | Exit | Evidence |
|---|---|---|
| `npm test` | 0 | `Tests  87 passed (87)` |
| `npm run typecheck` | 0 | clean |
| `npm run build` | 0 | clean |

### Open items (Medium/Low from REVIEW — not fixed)
- `apify-actor-start` not charged yet.
- Adaptive rate-limit / Retry-After → Phase 4.
- `EXTERNAL_HIDDEN` → Phase 3.
- Filter code verification → Phase 2.

### NEXT
Phase 2 — parser ground truth + real fixtures.
