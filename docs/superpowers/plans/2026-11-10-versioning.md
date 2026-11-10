# Versioning `1.BUILD` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every merge to main gives the app a new version `1.BUILD` (shown `1.36`), derived from the existing build counter, with releases staying manual.

**Architecture:** One pure function turns the counter into a semver (`scripts/version-for.js`). `scripts/build-info.js --bump` writes that version into `package.json` and `package-lock.json`, and CI's `build-number.yml` commits those files with the counter. The app label (`versionLabel`) stops printing `(build N)`, because the version now is the build.

**Tech Stack:** Node 20 (CommonJS script), Angular 18 + Jasmine/Karma (`TauriDesktop` launcher), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-10-versioning-design.md`

## Global Constraints

- Version = `major.minor.0` with `major = 1 + floor(build / 256)`, `minor = build % 256` (MSI: X, Y ≤ 255).
- Shown in the app without the trailing `.0`: `1.36`, `2.0`.
- Off-main or modified builds keep today's suffix rule: `1.36+ · feat/foo a1b2c3d, modified`. `HEAD` counts as main.
- Without `--bump` (`prestart`/`prebuild`), nothing in `package.json` changes.
- Releases, `release.yml`, `tauri.conf.json`, `Cargo.toml`, `update.service.ts`: unchanged.
- No commits until Boris approves; work on branch `feat/version-1-build` from main.

## Review Focus

1. **Three merges within one CI run.** GitHub keeps only one *pending* run per concurrency group, so a third quick merge cancels the second's queued run and the counter rises by 2 for 3 merges. That's acceptable (the version stays unique and increasing), but AGENTS.md must say so (Task 4).
2. **`package.json` formatting.** A rewrite that changes indentation or drops the trailing newline makes every bump commit a noisy diff. Task 2 checks that `git diff` shows only the version lines.
3. **`package-lock.json` left at `1.0.0`.** `npm ci` tolerates it, but the two files would disagree. Task 2 updates both root `version` fields (lines 3 and 9 today).
4. **build-info.json `version` lags package.json.** The JSON must carry the new version in the same bump run, otherwise the app built from the bump commit shows the old number. Task 2 asserts both.
5. **Build 0** (fresh fork, missing build-info.json): `versionFor(0)` = `1.0.0` and the label shows `1.0`, never `1.0+`. Task 1 and Task 3 pin it.

---

### Task 1: The formula

**Files:**
- Create: `scripts/version-for.js`

**Interfaces:**
- Produces: `versionFor(build: number): string` (CommonJS `module.exports = {versionFor}`), e.g. `versionFor(36) === '1.36.0'`.

- [ ] **Step 1: Write the self-check first.** At the bottom of the new file, under `if (require.main === module)`, `assert.strictEqual` these: `0 → '1.0.0'`, `36 → '1.36.0'`, `255 → '1.255.0'`, `256 → '2.0.0'`, `300 → '2.44.0'`. Print `version-for: ok` at the end.
- [ ] **Step 2: Run it to see it fail.** Run `node scripts/version-for.js`. Expected: `ReferenceError` / assertion failure, because `versionFor` is not written yet.
- [ ] **Step 3: Implement `versionFor(build)`** from the Global Constraints formula. Throw on a negative or non-integer build.
- [ ] **Step 4: Run it to see it pass.** Run `node scripts/version-for.js`. Expected: `version-for: ok`.

### Task 2: Bump writes the version

**Files:**
- Modify: `scripts/build-info.js` (bump branch, around lines 53-57; `info.version` at line 60)

**Interfaces:**
- Consumes: `versionFor` from Task 1.
- Produces: after `--bump`, `package.json.version`, `package-lock.json.version`, `package-lock.json.packages[""].version` and `src/build-info.json.version` all equal `versionFor(build)`.

- [ ] **Step 1: Implement.** When the counter was bumped, set `pkg.version = versionFor(build)`. Write `package.json` back as `JSON.stringify(pkg, null, 2) + '\n'`. In `package-lock.json`, set the root `version` and `packages[""].version` and write it the same way. Use `pkg.version` for `info.version`. Do nothing to either file when not bumping.
- [ ] **Step 2: Verify the bump.** Run `node scripts/build-info.js --bump --force && git diff --stat && git diff package.json package-lock.json`. Expected: both diffs touch only the `"version"` lines, which read `1.<current build + 1>.0`. `src/build-info.json` has the same `version`.
- [ ] **Step 3: Verify that a no-bump run leaves things alone.** Run `git checkout -- package.json package-lock.json src/build-info.json && node scripts/build-info.js && git diff --stat package.json package-lock.json`. Expected: no output.
- [ ] **Step 4: Clean up.** Run `git checkout -- package.json package-lock.json src/build-info.json`.

### Task 3: Label shows the number only

**Files:**
- Modify: `src/app/core/build-info.ts:17-34`
- Test: `src/app/core/build-info.spec.ts`

**Interfaces:**
- Produces: `versionLabel(info: BuildInfo): string` (same signature as today).

- [ ] **Step 1: Rewrite the spec's expectations** (base: `version: '1.15.0'`, `build: 15`, `commit: 'abc1234'`, `branch: 'main'`):
  - main → `'1.15'`
  - `branch: 'HEAD'` → `'1.15'`
  - `branch: 'feat/foo'` → `'1.15+ · feat/foo abc1234'`
  - `dirty: true` → `'1.15+ · abc1234, modified'`
  - `branch: 'feat/foo', dirty: true` → `'1.15+ · feat/foo abc1234, modified'`
  - new: `{version: '2.0.0', build: 256}` → `'2.0'`
  - new: `{version: '1.0.0', build: 0}` → `'1.0'`
- [ ] **Step 2: Run the spec and see it fail.** Run `npm run ng -- test --browsers=TauriDesktop --include='**/build-info.spec.ts' --watch=false`. Expected: the old `(build N)` output fails.
- [ ] **Step 3: Implement.** Show the version without a trailing `.0` (`version.replace(/\.0$/, '')`); off-main or dirty appends `+ · <where>[, modified]`. Update the doc comment's examples to `1.36` / `1.36+ · feat/foo a1b2c3d`.
- [ ] **Step 4: Run the spec and see it pass.** Same command. Expected: 7 specs, 0 failures.

### Task 4: CI commits the version, and the docs

**Files:**
- Modify: `.github/workflows/build-number.yml`
- Modify: `AGENTS.md` → "Versioning & Build Number"

- [ ] **Step 1: Workflow.**
  - Add top-level `concurrency: {group: build-number, cancel-in-progress: false}`.
  - In "Commit": test `git diff --quiet -- src/build-info.json package.json package-lock.json`, `git add` all three, and make the message `chore: build ${build} — v${version} [skip ci]` (`version` read from `package.json`).
  - Leave the rebase-retry loop as it is.
- [ ] **Step 2: Check the YAML parses.** Run `python3 -c "import yaml;print(list(yaml.safe_load(open('.github/workflows/build-number.yml'))))"`. Expected: the keys include `concurrency` and `jobs`.
- [ ] **Step 3: AGENTS.md.**
  - Replace the semver/counter text with: the formula, the four-row table from the spec, the label examples, and "releases stay manual; tag them `v<package.json version>`".
  - Add the Review Focus 1 limit: three merges inside one run can raise the counter by 2.
  - Update the `APP_VERSION` examples.
- [ ] **Step 4: Full checks.** Run `node scripts/version-for.js` (expect `version-for: ok`) and `npm run ng -- build` (expect `bundle generation complete`, no errors).
- [ ] **Step 5: Commit, after Boris's OK.**

```bash
git add scripts/version-for.js scripts/build-info.js src/app/core/build-info.ts src/app/core/build-info.spec.ts .github/workflows/build-number.yml AGENTS.md
git commit -m "feat: version is 1.BUILD, bumped with the build counter on every merge"
```

### Task 5: PR and the first real bump

- [ ] **Step 1:** Push `feat/version-1-build` and open a PR. The body has the spec link, the version table, and what was / was not checked.
- [ ] **Step 2:** After merge, check the bump commit on main. Run `git fetch && git show origin/main --stat | head` and `git show origin/main:package.json | grep '"version"'`. Expected: the message is `chore: build N — v1.N.0 [skip ci]`, and the three files changed with version `1.N.0`.
- [ ] **Step 3:** Build from main (`npm run build`). Expected: the app footer shows `1.N`, and the bundle is `QA Tool_1.N.0_aarch64.dmg` / `.app` version `1.N.0` (`defaults read ".../QA Tool.app/Contents/Info" CFBundleShortVersionString`).
