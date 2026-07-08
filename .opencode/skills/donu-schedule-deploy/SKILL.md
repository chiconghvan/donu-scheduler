---
name: donu-schedule-deploy
description: Use when user says "deploy donu scheduler", "release donu scheduler", "publish donu scheduler", "donu schedule deploy", "donu-scheduler deploy", "tạo release donu scheduler", or asks to release a new DonuScheduler version to GitHub with changelog, version bump, commit, tag, push, and GitHub Actions release verification.
---

# DonuScheduler Deploy

Deploy new DonuScheduler release to GitHub: analyze changes, create changelog entry, bump every authoritative version file, commit, create annotated tag, push, and verify GitHub Actions release with Windows x86_64 assets.

Use this skill only for `E:\Code\DonuScheduler` / `chiconghvan/donu-scheduler` release work.

## Release Model

- Tauri v2 desktop app: React/TypeScript frontend + Rust backend.
- Branch normally: `master` tracking `origin/master`.
- Tags use `vX.Y.Z`.
- GitHub Actions creates GitHub Release and Windows x86_64 assets after tag push.
- Do not create local build artifacts for release unless user asks.
- Do not force push.
- Always use annotated tags.

## Trigger

Use when user says any of:

- `deploy donu scheduler`
- `donu scheduler deploy`
- `donu schedule deploy`
- `release donu scheduler`
- `publish donu scheduler`
- `tạo release donu scheduler`
- `deploy version mới`
- `release version mới`

## Workflow

Execute steps in order. Stop and report if any required step fails.

### 1. Pre-Checks

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse --abbrev-ref --symbolic-full-name '@{u}'
git status --short
git status --branch --short
git log --oneline -10
git tag --sort=-v:refname | Select-Object -First 5
gh --version
gh auth status
```

Verify:

- Not detached HEAD.
- Upstream branch exists.
- `gh` CLI exists and is authenticated.
- If working tree is dirty, release includes current changes unless user says otherwise.
- If more than 20 changed files, ask user to confirm before proceeding.

If `gh` is unavailable or unauthenticated, continue through git commit/tag/push only if user wants, then report GitHub release verification skipped.

### 2. Analyze Full Diff

Use full working tree as release source of truth.

```bash
git diff --stat
git diff
git diff --cached --stat
git diff --cached
git ls-files --others --exclude-standard
```

Classify changes:

- `feat`: new user-visible functionality, commands, settings, flows, inputs.
- `fix`: bug fixes, error handling, reliability fixes.
- `docs`: docs only.
- `chore`: dependency, workflow, config, version, cleanup.
- `perf`: performance changes.
- `refactor`: structure change without behavior change.

Commit/release summary must describe what changed, not how.

### 3. Choose Version

Read current version from all authoritative files first:

```bash
node -p "require('./package.json').version"
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!target/**' --glob '!dist/**' --glob '!build/**' '("version"\s*:|^version\s*=|v[0-9]+\.[0-9]+\.[0-9]+|[0-9]+\.[0-9]+\.[0-9]+)' package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json CHANGELOG.md
git tag --sort=-v:refname | Select-Object -First 5
```

Default bump rules:

- Patch `0.0.X`: fixes, small improvements, docs, maintenance.
- Minor `0.X.0`: new features or new user-visible flows.
- Major `X.0.0`: breaking change. Confirm with user before major.

Always confirm target version with user before editing, using current version and suggested bump. If user gives exact target version, use that exact version.

### 4. Find Every Version File

Search whole repo for release version metadata before editing:

```bash
rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!target/**' --glob '!dist/**' --glob '!build/**' '("version"\s*:|^version\s*=|appVersion|productVersion|bundleVersion|CFBundleShortVersionString|CFBundleVersion|<version>|v[0-9]+\.[0-9]+\.[0-9]+)'
```

Known DonuScheduler version files:

| File | Field |
|---|---|
| `package.json` | root `version` |
| `package-lock.json` | root `version` and `packages[""].version` |
| `src-tauri/Cargo.toml` | `[package].version` |
| `src-tauri/Cargo.lock` | `[[package]] name = "donu-scheduler"` version only |
| `src-tauri/tauri.conf.json` | root `version` |
| `CHANGELOG.md` | release heading and compare links |

Rules:

- Bump every authoritative version file.
- Keep lockfiles synced.
- Do not bump dependency versions in `Cargo.lock`, `package-lock.json`, or docs.
- If authoritative files disagree on current version, stop and ask user which source wins.
- After bump, re-run search for old version in authoritative files.

### 5. Bump Version

Use apply_patch for manual edits. Smallest correct edit.

Required edits:

- `package.json`: `"version": "X.Y.Z"`
- `package-lock.json`: top-level and root package `"version": "X.Y.Z"`
- `src-tauri/Cargo.toml`: `version = "X.Y.Z"`
- `src-tauri/Cargo.lock`: only package block where `name = "donu-scheduler"`
- `src-tauri/tauri.conf.json`: `"version": "X.Y.Z"`

Optional native sync command if safe:

```bash
npm version X.Y.Z --no-git-tag-version
```

Still verify Tauri and Cargo files manually after any native command.

### 6. Update CHANGELOG.md

Follow existing `CHANGELOG.md` Keep a Changelog style.

Preferred format:

```markdown
## [Unreleased]

### Added

### Changed

### Fixed

## [X.Y.Z] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...
```

Bottom links:

```markdown
[Unreleased]: https://github.com/chiconghvan/DonuScheduler/compare/vX.Y.Z...HEAD
[X.Y.Z]: https://github.com/chiconghvan/DonuScheduler/compare/vOLD...vX.Y.Z
```

Rules:

- Add new release entry below `[Unreleased]`.
- Keep `[Unreleased]` empty for next cycle unless it already has content; move existing unreleased content into release entry.
- Map `feat` to `Added`.
- Map `fix` to `Fixed`.
- Map `chore`, `docs`, `refactor`, `perf` to `Changed` unless better category exists.
- Include `- Bump app version to X.Y.Z` under `Changed` only if version bump is not obvious from release heading or repo style requires it.
- Preserve all older changelog entries and compare links.

### 7. Generate Commit Message

Donut deploy standard, adapted for DonuScheduler:

```text
release: vX.Y.Z

- feat: ...
- fix: ...
- chore: bump version to X.Y.Z
```

Rules:

- Subject exactly `release: vX.Y.Z`.
- Body bullets mirror changelog items, without section headers.
- Use real multiline message via temp file or `git commit -F -`; never escaped `\n` string.
- Keep bullets concise and action-oriented.

### 8. Stage And Commit

```bash
git status --short
git add -A
git status --short
git commit -F <commit-message-file>
git rev-parse --short HEAD
```

Stage all intended release changes: version files, changelog, code, workflow changes, deletions, new files.

### 9. Create Annotated Tag

Check tag collision first:

```bash
git tag --list "vX.Y.Z"
```

If tag does not exist:

```bash
git tag -a vX.Y.Z -m 'vX.Y.Z - <one-line summary>'
git tag --points-at HEAD
```

If tag exists, stop and ask user whether to skip, delete local tag only, or abort. Never overwrite remote tag without explicit user approval.

### 10. Push Branch And Tags

```bash
git push origin <current-branch> --tags
```

Rules:

- Never force push.
- If push fails because remote has new commits, tell user to run or allow `git pull --rebase`, then retry.
- If only tag push fails because tag exists remotely, stop and report.

### 11. Verify GitHub Actions Release

DonuScheduler workflows create release assets after tag push. Do not create duplicate release locally unless workflow is absent or failed and user asks.

```bash
gh run list --limit 5
gh run watch <run-id> --exit-status
gh release view vX.Y.Z --json url,tagName,name,isDraft,isPrerelease,publishedAt,assets
git ls-remote --tags origin vX.Y.Z
git status --branch --short
```

Expected:

- Release workflow succeeds.
- Windows x86_64 workflow succeeds.
- GitHub Release exists at `https://github.com/chiconghvan/donu-scheduler/releases/tag/vX.Y.Z`.
- Release has Windows installer/portable assets if workflow produced them.

Workflow warnings are not failures. Report notable warnings, for example deprecated actions/runtime or ignored workflow inputs.

### 12. Final Report

Output:

```text
Release vX.Y.Z complete
- Commit: <hash>
- Tag: vX.Y.Z
- Release: <URL>
- Branch: <branch> -> origin
- Version files updated: <files>
- Workflow: <success/running/failed>
```

If release workflow is still running, say release tag and branch push are complete, then report workflow URL/status.

## Error Handling

- Dirty tree with more than 20 files: ask confirmation before staging.
- Detached HEAD: stop.
- Missing upstream: stop and ask where to push.
- Missing `gh` auth: tell user to run `gh auth login`; continue git release only if user approves.
- Tag exists: ask user. Do not overwrite remote tag by default.
- Push rejected: suggest `git pull --rebase` then retry.
- Conflicting version files: stop and ask.
- No `package.json`: derive current version from latest tag and ask user before bump.

## PowerShell Notes

This workspace runs on Windows PowerShell 5.1.

- `head` may not exist; use `Select-Object -First N`.
- Quote paths with spaces.
- Prefer workdir over `cd`.
- Use temp files for commit message and release notes:

```powershell
$msg = @'
release: vX.Y.Z

- feat: ...
- chore: bump version to X.Y.Z
'@
$path = Join-Path $env:TEMP 'donuscheduler-release-commit.txt'
Set-Content -LiteralPath $path -Value $msg -NoNewline
git commit -F $path
```

## Notes

- Release asset comes from GitHub Actions, not local machine.
- Keep changes minimal.
- Never revert user changes.
- Never force push.
- Always use annotated tags.
- After creating or editing this skill, user must restart opencode for skill list refresh.
