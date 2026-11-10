# Versioning: `1.BUILD` — design

Date: 2026-11-10. Status: proposed, waiting for review.

## Goal

When a teammate reports a problem with the tool, the version alone tells which build they run.
Today every build says `1.0.0`, and only the label's `(build N)` tells builds apart; installers
and release tags all say `1.0.0`.

## Decisions (from the brainstorm)

| Question | Answer |
|---|---|
| What the version is for | Knowing which build someone has |
| Format | `1.BUILD` — shown as `1.36`, stored as `1.36.0` |
| Releases | Unchanged: manual, only when someone publishes one |
| What the app shows | Just the number |

Rejected: date-based `YY.M.BUILD`, a release on every merge, copy-for-bug-report, "what's new"
after update, a behind-by badge.

## The number

`BUILD` is the counter `build-number.yml` already raises on every merge to main (36 today). The
version is derived from it, so there is still one counter and nothing to edit by hand.

The Windows installer (MSI) accepts `X.Y.Z` only with `X ≤ 255`, `Y ≤ 255`, `Z ≤ 65535`. `1.BUILD`
puts the counter in `Y`, so it rolls over after 255:

```
major = 1 + floor(build / 256)
minor = build % 256
version = major.minor.0
```

| build | version | shown |
|---|---|---|
| 36 | `1.36.0` | `1.36` |
| 255 | `1.255.0` | `1.255` |
| 256 | `2.0.0` | `2.0` |
| 300 | `2.44.0` | `2.44` |

The rollover is 220 merges away; it is in the formula so nobody has to remember it.

## What changes

1. **`scripts/build-info.js`** — after a bump, also writes `version` in `package.json` from the
   formula above. Without `--bump` (the `prestart` / `prebuild` run) it leaves `package.json` alone,
   as it does the counter. The formula is a small exported function with an assert-based self-check
   for the four rows of the table.
2. **`.github/workflows/build-number.yml`** — stages `package.json` with `src/build-info.json` in the
   same `chore: build N [skip ci]` commit. Adds `concurrency: build-number` (no cancel) so two quick
   merges queue instead of racing. On 2026-11-09 two merges landed together and one bump was lost
   (three merges, counter +2).
3. **`src/app/core/build-info.ts`** — `versionLabel` drops `(build N)`, since the number now is the
   build:
   - main: `1.36`
   - branch or modified tree: `1.36+ · feat/foo a1b2c3d, modified` (same rule as today)
4. **`AGENTS.md` → Versioning & Build Number** — rewritten for the above, with the rollover table.

Nothing else: `tauri.conf.json` already reads the version from `package.json`, so installers become
`QA-Tool_1.36.0_<platform>` and `release.yml` (which names files from `package.json`) needs no
change.

## Releases and the update prompt

Unchanged process: a release is published by hand. Its tag must match the version at that commit,
`v1.36.0`. There is no in-app update prompt today: `UpdateService` can fetch the latest release
and compare semver, but nothing calls it (found in review). Wiring it up is separate work.

## Not affected

- `Cargo.toml` version (internal; the product version comes from `tauri.conf.json`).
- The `smartTvQaTool:ignoreVersionUntil` key — still compares semver.
- Data paths and identifiers (see AGENTS.md → Legacy Names That Hold User Data).

## Checks

- Self-check of the formula in `build-info.js` (builds 36, 255, 256, 300).
- `npm run build` locally on a branch: the app shows `1.36+ · <branch> <sha>`, the bundle is
  named `1.36.0`.
- After the PR merges: the bump commit sets `package.json` to the next version, CI's next build
  shows `1.N`, and `release.yml` dispatched by hand produces `QA-Tool_1.N.0_*` files.
