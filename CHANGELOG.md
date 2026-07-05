# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.7.4] - 2026-07-05

### Changed
- Split global stylesheet into modular foundation, layout, component, and page CSS files
- Add numeric datetime formatter for Script Store metadata
- Show Script Store updated timestamps in numeric date format

## [0.7.1] - 2026-07-05

### Fixed
- Stop updater script from relaunching app too early during install flow
- Launch post-install script with suppressed console window on Windows

## [0.7.0] - 2026-07-05

### Added
- File picker support and safer cached default inputs
- Day-based schedule intervals and compact interval labels
- Configurable log retention cleanup with settings UI

### Changed
- Improve runtime argument parsing and hidden Windows process spawning
- Update app version metadata to 0.7.0

## [0.6.1] - 2026-07-05

### Added
- Randomized delay gating (`spawn_runtime_queued`) to stagger concurrent runtime spawns
- `progressClassName` prop for custom progress bar styling

### Fixed
- Fix ResultCount to count only successful tasks instead of non-running
- Fix log dialog layout with dedicated scroll container

### Changed
- Simplify TestLabPage profile picker UI
- Update activity grid layout, log dialog, and progress bar styles

## [0.5.0] - 2026-07-05

### Added
- New Scripts Manager page with tabbed interface and script inspector
- Profile picker dialog for easier profile selection in Manual Run
- Update available toast notification for in-app update prompts
- New `disable_runtime_updates` setting for controlling auto-updates
- Responsive breakpoints for smaller screens

### Changed
- Redesigned Dashboard with hero section, KPI grid, and workload panel
- Simplified window drag hook for better performance
- Improved Activity page layout with history table grouping
- Log viewer now uses white background with word wrap
- Deleted legacy planning docs

## [0.4.6] - 2026-07-05

### Added
- Light, dark, and system theme selection in settings

### Changed
- Apply themed surfaces across badges, logs, toasts, and controls
- Improve update status indicators for app and runtime updates

### Fixed
- Run app installer updates with NSIS/MSI-specific silent handling

## [0.4.5] - 2026-07-05

### Added
- Keyed progress toasts for runtime and app downloads
- Runtime update check and pending-update controls in settings

### Fixed
- Preserve pending installer state and log silent app installs

## [0.4.4] - 2026-07-05

### Fixed
- Persist pending app installer path for restart installs
- Run app updates through silent installer script after exit
- Support MSI update assets and installer arguments
- Update restart UI copy and remove required installer path

## [0.4.3] - 2026-07-04

### Fixed
- Prevent unnecessary runtime download when installed version is current
- Remove redundant tasklist fallback in `is_runtime_running()`
- Disable "Update Now" button when no update is available
- Sync Cargo.lock version with package.json

## [0.4.2] - 2026-07-04

### Fixed
- Suppress flashing cmd windows when running taskkill/tasklist on Windows
- Remove verbose download progress toasts for runtime and app updates

## [0.4.1] - 2026-07-04

### Changed
- Replace auto-update checkbox with toggle switch and descriptive hint
- Restructure Application Update section with card-based layout
- Add responsive grid display for version metadata
- New CSS component classes for settings UI patterns

## [0.4.0] - 2026-07-04

### Added
- App auto-updater system with GitHub release checking, download progress, and installer execution
- App update UI in SettingsPage (check, download, install & restart)
- Event listeners in RuntimeToastHost for update lifecycle events
- `disable_auto_updates` setting toggle
- GitHub Actions release workflow for Windows x86_64
- Build version injection (dev/nightly/stable)
- Frontend API wrappers and TypeScript types for update flow

### Fixed
- Sync Cargo.toml and tauri.conf.json version to 0.4.0
- Simplify Collect artifacts step in release workflow

## [0.3.2] - 2026-07-04

### Added
- Dialog-based job creation with validation and Vietnamese error messages
- Day presets for schedule (Mỗi ngày, Ngày thường, Cuối tuần)
- Section titles and hints to job form for better UX
- Profile filter row layout (search + group select) to picker and test lab
- Chip-style selected profile display with overflow count
- Responsive CSS for dialog and form sections

### Changed
- Replace inline create form with modal dialog (JobCreateDialog)

## [0.3.1] - 2026-07-04

### Added
- Browser type field to ProfileSummary and all profile clients
- Display browser type (Firefox/Chrome) in ProfilePickerDialog rows
- Ctrl+A multi-select and toggle-visible selection in picker

### Changed
- Improve TestLabPage with updated features
- Rename Test Lab to Manual Run in navigation

## [0.3.0] - 2026-07-04

### Changed
- Consolidate test run, running, and run history pages into Activity and TestLab pages
- Replace rail navigation with new Sidebar component
- Extract window controls into dedicated WindowControls component

### Added
- `useWindowDrag` hook for native window dragging
- Toast and Dialog as shared common components
- pnpm workspace support with lockfile and workspace config
- Architecture and design documentation

## [0.2.1] - 2026-07-04

### Fixed
- Generate Tauri icons from valid PNG
- Find Tauri bundle asset in target triple directory
- Add missing floating field labels
- Release workflow Rust setup
- Release NSIS and portable zip only

## [0.2.0] - 2026-07-03

### Added
- Script Store marketplace with install, update, and catalog browsing
- LiveLogViewer component for real-time log streaming with auto-scroll
- DashboardPage with system overview and quick actions
- FloatingInput/FloatingSelect components with animated labels
- Runtime download progress tracking with percentage display
- Script store update notifications via toast system
- Light/dark theme toggle with CSS variable system
- `log_entries` table and settings KV store

### Changed
- Redesigned Settings, Running, Manual Run, Run History, and Jobs pages
- Improved toast system with stacked notifications, upsert, and auto-close controls
- Improved runner module with streaming log capture and process management
- Improved runtime manager with download progress events and status reporting

### Fixed
- Profile picker dialog layout and form input styling

## [0.1.0] - 2026-07-02

### Added
- Initial project scaffold with Tauri v2, React, TypeScript, and SQLite
- Basic script CRUD, job scheduling, and run history
- Profile manager integration with GPMLogin and Donut Browser
- Runtime runner with fake/real process dispatch

[Unreleased]: https://github.com/chiconghvan/DonuScheduler/compare/v0.7.4...HEAD
[v0.7.4]: https://github.com/chiconghvan/DonuScheduler/compare/v0.7.3...v0.7.4
[0.7.2]: https://github.com/chiconghvan/DonuScheduler/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/chiconghvan/DonuScheduler/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/chiconghvan/DonuScheduler/compare/v0.6.1...v0.7.0
[0.6.1]: https://github.com/chiconghvan/DonuScheduler/compare/v0.5.0...v0.6.1
[0.5.0]: https://github.com/chiconghvan/DonuScheduler/compare/v0.4.6...v0.5.0
[0.4.6]: https://github.com/chiconghvan/DonuScheduler/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/chiconghvan/DonuScheduler/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/chiconghvan/DonuScheduler/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/chiconghvan/DonuScheduler/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/chiconghvan/DonuScheduler/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/chiconghvan/DonuScheduler/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/chiconghvan/DonuScheduler/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/chiconghvan/DonuScheduler/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/chiconghvan/DonuScheduler/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/chiconghvan/DonuScheduler/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/chiconghvan/DonuScheduler/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/chiconghvan/DonuScheduler/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/chiconghvan/DonuScheduler/releases/tag/0.1.0
