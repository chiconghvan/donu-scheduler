# DonuScheduler

Desktop app to manage automation jobs and script database offline. Built with Tauri v2 + Rust + React + TypeScript + Vite + SQLite.

## Tech Stack

- **Backend:** Rust + Tauri v2
- **Frontend:** React 19 + TypeScript + Vite 6
- **Database:** SQLite (rusqlite, bundled)
- **Profile APIs:** GPMLogin + Donut Browser (local REST)

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://rustup.rs/) (stable)
- Windows build tools (MSVC)

### Dev Mode

```bash
# Install frontend deps
npm install

# Run in dev mode (opens Tauri window with hot-reload)
npm run tauri dev
```

### Build Release

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

## Project Structure

```
DonuScheduler/
├── src/                          # Frontend (React + TypeScript)
│   ├── api.ts                    # Tauri invoke wrappers
│   ├── types.ts                  # TypeScript type definitions
│   ├── App.tsx                   # Main app with navigation
│   ├── App.css                   # Global styles
│   └── components/
│       ├── ScriptsPage.tsx       # Script CRUD
│       ├── JobsPage.tsx          # Job CRUD + enable/disable
│       ├── JobDetailPage.tsx     # Job states + run history
│       ├── TestRunPage.tsx       # Manual test run + profile selector
│       └── SettingsPage.tsx      # App settings
├── src-tauri/                    # Backend (Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs               # Entry point
│       ├── lib.rs                # Tauri builder + command registration
│       ├── db.rs                 # SQLite connection + migrations
│       ├── models.rs             # Data models + scheduler math
│       ├── scripts/
│       │   ├── repository.rs     # Script CRUD
│       │   └── commands.rs       # Tauri commands
│       ├── jobs/
│       │   ├── repository.rs     # Job + state + run CRUD
│       │   ├── scheduler.rs      # Scheduler background loop
│       │   └── commands.rs       # Tauri commands
│       ├── test_runs/
│       │   ├── repository.rs     # Test run CRUD
│       │   └── commands.rs       # Tauri commands
│       ├── runner/
│       │   ├── mod.rs            # Runner abstraction (fake + real)
│       │   └── fake_runner.rs    # Reserved for future helpers
│       ├── profile_manager/
│       │   ├── mod.rs            # ProfileManagerClient trait
│       │   ├── gpmlogin_client.rs    # GPMLogin REST client
│       │   └── donutbrowser_client.rs # Donut Browser REST client
│       └── settings/
│           ├── repository.rs     # Settings CRUD
│           └── commands.rs       # Tauri commands
├── design/                       # UI/design docs
│   ├── README.md
│   ├── design.md
│   ├── new-ui-architecture.md
│   ├── new-ui-to-logic-map.md
│   ├── workflow-logic-map.md
│   └── screens.md
├── docs/                         # API guides
│   ├── GPM_API_GUIDE.md
│   ├── donut-api-guide.md
│   └── cli-guide.md
└── donumate_v0.5.6.exe           # Runtime (to be integrated)
```

## Features

### Scripts Database
- CRUD scripts offline
- Each script: name, description, script_path, default_args_json
- SQLite storage in app data directory

### Job System
- CRUD jobs with schedule + random configs
- Enable/disable toggle per job
- JSON validation for schedule, random, profile_ids, cli_args

### Scheduler (Background Loop)
- Runs every 20 seconds
- Scans enabled jobs, creates daily profile states
- Adaptive random scheduling algorithm
- Fake execution (2s sleep) - ready to swap in real runtime

### Test Run (Manual)
- Pick a script from DB
- Pick a profile from GPMLogin or Donut Browser tabs
- Enter CLI args
- Run, view status, view logs
- Stop button (TODO for real runner)

### Profile Manager
- GPMLogin: `GET /api/v3/profiles` (Standard API)
- Donut Browser: `GET /v1/profiles`
- Read API base URLs from Settings

### Settings
- `runtime_path` - path to donumate exe
- `gpmlogin_api_base_url`
- `donutbrowser_api_base_url`
- `global_max_parallel_runtime` (placeholder)

## Database

SQLite file: `%LOCALAPPDATA%/DonuScheduler/donu_scheduler.sqlite`

Tables:
- `scripts` - script database
- `jobs` - job definitions
- `job_profile_states` - daily per-profile state
- `job_runs` - scheduler run history
- `test_runs` - manual test run history
- `settings` - key-value settings

Auto-created and migrated on first launch.

## Adapting the Runner

To replace fake execution with real `donumate_vX.exe`:

1. Edit `src-tauri/src/runner/mod.rs`
2. Implement `run_runtime()` - spawn process, capture output
3. Update `scheduler.rs` and `test_runs/commands.rs` to call `run_runtime()` when `runtime_path` is non-empty
4. The `RunnerRequest` struct already contains all needed fields

## License

Private project.
