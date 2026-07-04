# Changelog

## 0.4.3 - 2026-07-04

### Fixed
- Skip redundant runtime download when already up to date
- Disable "Update Now" button when no update is available
- Remove redundant tasklist fallback in runtime process detection
- Show toast feedback when clicking update with no pending version
- Sync Cargo.lock version with package.json

## 0.2.0 - 2026-07-03

### Added
- Runtime manager UI and toast host.
- New profile picker dialog.
- Job scheduler, run history, test run, and settings updates.

### Changed
- Large Tauri backend refactor around jobs, models, DB, and runner flow.
- Frontend job and run history pages refreshed.
- App styling updated.
