# Manual Test

## Launch
Input: app start. Steps: open app, click all sidebar pages, drag/min/max/hide window. Expected: pages render, no crash.

## Store
Input: GitHub token, script id. Steps: open Store, save token, search, install script, update script. Expected: catalog loads, status badges update. Error: invalid token/network -> toast.

## Test Single
Input: script, one profile, args. Steps: select script, select manager/profile, run, view live log, wait finish. Expected: `TestRun` created, logs stream, status success/failed. Error: missing profile manager/runtime -> toast or panel error.

## Test Batch
Input: script, multiple profiles. Steps: select profiles, Run Batch, stop batch. Expected: batch rows created, queued/running observed, stop updates statuses.

## Jobs Create/Edit
Input: name, script, schedule, profiles, timeout. Steps: create job, edit job, save, toggle enabled, delete with confirm. Expected: job list updates, backend validation errors shown as toast.

## Job Detail
Input: selected job. Steps: open overview/states/runs tabs, stop running job run. Expected: metrics/states/runs show, stopped run updates after refresh.

## Activity
Input: active test/job. Steps: watch active tasks, expand task, stop process/task/job, open log, filter history. Expected: active list polls, history/logs work.

## Settings
Input: API URLs, parallel limit. Steps: edit/save settings, run runtime update. Expected: success toast, runtime status updates. Error: backend error -> error toast.

## Scheduler
Input: enabled fixed-interval job. Steps: wait for scheduler tick, observe Activity and Job states. Expected: due job runs, next_run_at updates, disabled job does not run.
