# Screens

## Dashboard
Purpose: glance status. Data: scripts, jobs, active tasks, run history. Actions: navigate, refresh. States: skeleton, empty jobs, error banner.

## Script Store
Purpose: install/update scripts. Data: token status, catalog. Actions: save token, search/filter, install, update, refresh, inspect script. States: token gate, loading, empty, action busy.

## Test Lab
Purpose: run script manually before scheduling. Data: scripts, profiles, input cache, test runs, log tail/events. Actions: select script, edit inputs/args, select profiles, run single/batch, stop, view log. States: no script, profiles loading/error, live log, recent runs.

## Jobs
Purpose: create/edit/manage scheduled automation. Data: jobs, scripts, profile picker, today states, job runs, input cache. Actions: create/edit/delete/toggle, choose schedule/profiles, stop run. States: no jobs, no selection, form, detail tabs.

## Activity
Purpose: monitor and intervene. Data: running tasks, run history, logs. Actions: stop task/process, stop job, filter/search history, view live/static log. States: no active tasks, no history, log modal.

## Settings
Purpose: configure external APIs and runtime. Data: settings, runtime status. Actions: save settings, update runtime. States: loading, saved toast, update progress/error toast.
