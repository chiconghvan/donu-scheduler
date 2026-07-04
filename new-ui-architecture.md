# New UI Architecture

## Modules
| Module | User goal | Page |
|---|---|---|
| Dashboard | See health, active tasks, next jobs, recent runs | `DashboardPage` |
| Script Store | Install/update scripts | `ScriptStorePage` |
| Test Lab | Test scripts against profiles, view live logs | `TestLabPage` |
| Jobs | Create/edit/monitor scheduled jobs | `JobsPage` |
| Activity | Stop running work, review history/logs | `ActivityPage` |
| Settings | Configure profile APIs and runtime | `SettingsPage` |

## Shell
`App.tsx` owns page navigation. `Sidebar` provides icon nav. `WindowControls` owns Tauri window actions. Providers: `ToastProvider`, `DialogProvider`, `RuntimeToastHost`.

## Component Layers
`common`: Badge, Dialog, EmptyState, Toast.

`domain`: LogViewer, StatusBadge, ManagerBadge, DefaultInputs, ScheduleForm, ProfilePickerDialog, RuntimeToastHost.

`pages`: workflow screens only.

`utils/hooks`: pure adapters and stateful reusable behavior.

## Page Data/Actions
Dashboard loads `listScripts`, `listJobs`, `listRunningTasks`, `listRunHistory`.

Store loads token/catalog, installs/updates scripts, applies pending updates every 15s.

Test Lab loads scripts/profiles/runs, runs single/batch tests, saves input cache, streams logs.

Jobs loads jobs/scripts, creates/updates/deletes/toggles jobs, shows states/runs, stops job runs.

Activity polls running tasks every 3s, loads history, stops tasks/processes, opens logs.

Settings loads/saves settings, shows runtime status, starts runtime update.
