# Legacy GUI Removal Plan

## Legacy GUI Files Removed
Removed root-level legacy components under `src/components/`:
`DashboardPage.tsx`, `ScriptsPage.tsx`, `ScriptStorePage.tsx`, `JobsPage.tsx`, `JobDetailPage.tsx`, `TestRunPage.tsx`, `RunningPage.tsx`, `RunHistoryPage.tsx`, `SettingsPage.tsx`, `ProfilePickerDialog.tsx`, `FloatingField.tsx`, `DialogHost.tsx`, `LiveLogViewer.tsx`, `RuntimeToastHost.tsx`.

Removed `src/App.css` and replaced with `src/styles/index.css`.

## Logic Kept
Kept backend, schema, commands, `src/types.ts`, `src/api.ts`, runtime behavior.

## Logic Extracted From GUI
| Old coupling | New location |
|---|---|
| Schedule JSON serialization/parsing | `src/utils/schedule.ts` |
| CLI input arg builder | `src/utils/cliArgs.ts` |
| History grouping | `src/utils/historyGrouping.ts` |
| Profile helpers | `src/utils/profiles.ts` |
| Script input parser | `src/utils/scriptParser.ts` |
| Formatting helpers | `src/utils/format.ts` |
| Multi-select interaction | `src/hooks/useMultiSelect.ts` |
| Profile loading | `src/hooks/useProfiles.ts` |
| Polling | `src/hooks/useInterval.ts` |
| Window drag | `src/hooks/useWindowDrag.ts` |

## New GUI Rule
Pages call `src/api.ts` service functions only. Components do not call database. Backend command names unchanged.
