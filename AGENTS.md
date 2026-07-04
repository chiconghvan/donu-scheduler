# AGENTS.md — DonuScheduler

## Build & Run

```bash
npm install
npm run tauri dev        # dev mode with hot-reload
npm run tauri build      # release build
cargo check              # backend-only check (from src-tauri/)
npx tsc --noEmit         # frontend-only type check
```

## Architecture

Tauri v2 desktop app. Rust backend + React/TypeScript/Vite frontend + SQLite.

- **Frontend:** `src/` — React 19, Vite 6, TypeScript 5.7
- **Backend:** `src-tauri/src/` — Rust, rusqlite (bundled), tokio, reqwest
- **DB:** `%LOCALAPPDATA%/DonuScheduler/donu_scheduler.sqlite`
- **Runtime:** `donumate_v0.5.6.exe` at repo root (spawned by runner module)
- **UI docs:** `design/` (design notes, screen maps, workflow maps)
- **API docs:** `docs/`

## Rust Module Map

```
src-tauri/src/
  main.rs          → entry, calls lib::run()
  lib.rs           → Tauri builder, command registration, scheduler spawn
  db.rs            → SQLite connection, migrations, settings KV
  models.rs        → all data types, schedule math, helpers
  scripts/         → script CRUD (repository + commands)
  jobs/            → job CRUD + scheduler loop + run history
  test_runs/       → manual test run CRUD
  runner/          → process spawn abstraction (fake + real)
  profile_manager/ → GPMLogin + Donut Browser REST clients
  settings/        → key-value settings CRUD
```

Frontend layout:

```text
src/
  components/common/   → Dialog, Toast, EmptyState, Badge helpers
  components/domain/   → LogViewer, ProfilePickerDialog, DefaultInputs, etc.
  components/pages/    → Dashboard, Script Store, Manual Run, Jobs, Activity, Settings
  components/shell/    → App shell, Sidebar, WindowControls
  hooks/               → reusable state/interaction hooks
  utils/               → pure helpers/adapters
  styles/index.css     → global dark theme CSS
```

## Frontend → Backend

Frontend calls `invoke("command_name", { args })` from `@tauri-apps/api/core`.
All Tauri commands are registered in `lib.rs:48-69`.
Type definitions in `src/types.ts`, API wrappers in `src/api.ts`.

## DB Schema

Auto-created on first launch. Tables: `scripts`, `jobs`, `job_profile_states`, `job_runs`, `test_runs`, `settings`.

If schema changes, delete `%LOCALAPPDATA%/DonuScheduler/donu_scheduler.sqlite` to regenerate.

## Key Gotchas

- **Tokio runtime:** `setup` callback runs outside Tokio. Use `tauri::async_runtime::spawn()`, NOT `tokio::spawn()`. Tauri async commands run in Tokio context and can use `tokio::spawn()`.
- **CLI args are plain text** (`--headless --input key=value`), NOT JSON. Stored in `cli_args` / `default_args` columns.
- **Runner dispatch:** `runner::run()` checks `runtime_path` — empty → fake (2s sleep), non-empty → spawns `donumate_vX.exe`.
- **Scheduler:** Background loop in `lib.rs:40-45`, ticks every 20s. Reads settings from DB on each tick.
- **Profile manager:** GPMLogin uses `/api/v3/profiles`, GPM Global uses `/api/v1/profiles`, Donut uses `/v1/profiles`. API URLs from settings table.
- **Browser type display:** backend maps raw `camoufox` to UI `Firefox`, everything else to `Chrome`.

## Conventions

- All Rust commands return `Result<T, String>` (errors surface to frontend as strings).
- JSON fields (`schedule_json`, `random_json`, `profile_ids_json`) validated with `serde_json::from_str` on insert/update.
- IDs are UUID v4 strings (`uuid::Uuid::new_v4()`).
- Timestamps are ISO 8601 local time (`chrono::Local::now().format("%Y-%m-%dT%H:%M:%S")`).
- Frontend: no UI library, plain CSS in `src/styles/index.css`, dark theme.
