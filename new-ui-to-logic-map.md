# New UI To Logic Map

| Screen | Action | Input | Service/function | Output | Error handling |
|---|---|---|---|---|---|
| Dashboard | Load metrics | none | `listScripts`, `listJobs`, `listRunningTasks`, `listRunHistory` | page data | banner/toast |
| Store | Check token | none | `scriptStoreHasToken` | bool | token form/error toast |
| Store | Save token | token | `scriptStoreSaveToken` | void | error toast |
| Store | List catalog | none | `listScriptStore` | catalog | error toast |
| Store | Install/update | script id | `installScriptStore`, `updateScriptStore` | install result | error toast |
| Test Lab | Load scripts/profiles | manager | `listScripts`, `list*Profiles` | lists | panel error |
| Test Lab | Run single | script, profile, args, snapshot | `runScriptTest` | `TestRun` | error toast |
| Test Lab | Run batch | script, profiles, args, snapshots | `runBatchTest` | `TestRun[]` | error toast |
| Test Lab | Stop | run/batch id | `stopTestRun`, `stopBatchTestRun` | void | error toast |
| Test Lab | Logs | kind/run id | `getRunLogTail`, `log-stream` | entries | log error |
| Jobs | CRUD | `JobInput` | `createJob`, `updateJob`, `deleteJob` | job/void | toast/dialog |
| Jobs | Toggle | job id, enabled | `setJobEnabled` | void | toast |
| Jobs | Detail | job id | `getTodayJobStates`, `listJobRuns` | states/runs | tab error |
| Jobs | Stop run | run id | `stopJobRun` | void | toast |
| Activity | Running | none | `listRunningTasks` | tasks | silent retry/toast |
| Activity | Stop | kind/id/mode | `stopRunningTask`, `stopRunningProcess` | void | toast |
| Activity | History/log | filters/run id | `listRunHistory`, `getRunLogTail` | rows/logs | toast |
| Settings | Save | `Settings` | `updateSettings` | void | toast |
| Settings | Runtime | none | `getRuntimeStatus`, `updateRuntime` | status/void | toast |

## Adapters
`schedule.ts`: schedule UI <-> JSON.

`cliArgs.ts`: default inputs + manual args -> CLI string.

`profiles.ts`: selected profiles -> `ProfileSnapshot[]`.

`historyGrouping.ts`: flat history -> grouped tasks.
