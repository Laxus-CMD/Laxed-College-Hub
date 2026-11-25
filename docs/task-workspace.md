# Tasks workspace

The Tasks page offers four workspace modes. Each is a way of working, not a different chart
of the same list. They all read and write the one task store (`useTaskStore`), so a change in
any mode shows at once in the others, on the Schedule calendar and in the dashboard widgets.

| Mode | For | Phase |
| --- | --- | --- |
| Classic | Seeing everything that is due, grouped by urgency, and ticking it off | 1 (done) |
| Flow | Work that takes several sittings: Not started, In progress, Completed | 2 (done) |
| Workload | Seeing which days are heavy, by course, before they arrive | 4 (done) |
| Between Classes | Fitting tasks into the gaps in today's timetable, around reserved time | 5 |

## Architecture

- `src/features/assignments/workspace/` holds what every mode shares:
  - `modes.ts` registers the modes in switcher order. A mode not registered yet opens Classic.
  - `useWorkspace()` gives every mode the clock, the tasks after the course filter, and the course of each task. The course filter is the same `taskCourse` the sidebar and search set; a course that no longer exists stops filtering.
  - `useTaskMode()` gives the saved mode.
  - `useFlashedTask()` (run by the page, not the modes) scrolls to a task opened from search or the dashboard and ends the highlight. A mode that hides tasks reveals the flashed one from `flashTaskId`.
  - `ModeSwitcher` is a radio group (arrow keys, one tab stop).
  - `src/lib/stage.ts` and `moveTaskToStage` (in `store/actions.ts`, with Undo) define Flow's stages from `done` and `progress`.
  - `TaskComposer` adds a task in place. A mode passes `defaults` to say what a task added there starts as.
- Each mode lives in its own folder (`classic/`, later `flow/` and so on). It uses the shared
  `TaskRow`, `urgency.ts` and `taskType.ts` and the store actions (`deleteTask`, `rescheduleTask`,
  Undo), never copies of them.
- Modes after Classic load on demand (`React.lazy`) inside the page's own `Suspense`, so the page's first load does not grow with each mode and only the mode area waits.
- Lists the app and the API both hold (mode ids, keep-if-missing fields) are checked against each other in `tests/contract.test.ts`.

## Data

Every new field is nullable, and an older app that leaves it out keeps what is saved
(`KEEP_IF_MISSING` in `server/dataSchema.ts` and in `src/sync/doc.ts`; `tests/contract.test.ts`
fails if they differ). Each new field gets a database CHECK as well as a zod rule.

| Phase | Change | Migration | Notes |
| --- | --- | --- | --- |
| 1 | `student_profiles.task_mode` (`taskMode` in the profile) | 008 | Synced with the account; guests keep it in their local settings. Null means Classic. |
| 2 | `tasks.progress`: text, null or `'started'` (a CHECK, so another stage can be added) | 009 | In progress means not done and started. `done` stays the one record of completion, so the calendar, dashboard and older apps need no change. Completing a task keeps `progress`, so un-completing it (here or in an older app) returns it to In progress, where it was. Order inside a column follows urgency; no manual ranking is stored. |
| 4 | `tasks.estimate` (integer minutes, 5 to 1440, CHECK and `.int()`; feature `estimate`) | 010 | Optional, picked from a short list in the task dialog or on Workload's day list, shown only where the API lists `estimate`. With no estimate, Workload counts tasks; time is offered only once a task in view has one, and always says how many of the tasks it covers. It never guesses an estimate. |
| 5 | Reserved time (breaks, personal time) | 011 | A new record kind (table `reserved_times`, `(user_id, id)` key, cascade with the profile), synced like classes: days, start, end, label, optional term dates with the same keep-if-missing rule. Free windows come from the timetable (`meetsOn`, `freePeriods`) minus reserved time. A new kind touches every hard-coded kind list: server `KINDS`, `TABLES`, LOAD, `QUOTAS` and quota checks; `diff` and `notYetApplied`; `mergeImport` counts and `withoutUntouchedSample`; `readDeviceDoc`/`clearDeviceData` and a new persisted guest store; backups and pending-change checks. Decide then whether Clear data, the sample data and Undo include it. |

Migrations 009 to 011 may be combined into fewer files if those phases ship in one release.

Phase 3 (Focus: one task with its steps, notes and the Pomodoro timer) was dropped on 2026-11-25 before
release, along with its `tasks.steps` field and its mode id.

## Deploy order

Two ways an old API mishandles a new app:

- **Refused (loud).** The profile and the `upsert`/`remove` lists are strict, so an old API answers 400 to a
  new profile field (`taskMode`) or a new record kind (`reserved_times`), and the app's saves stay blocked.
- **Dropped (silent).** A task record is not strict, so an old API drops `progress`, `steps` or `estimate`,
  answers 200, and the app believes it saved. Other devices never see the change, and it is gone on reload.

So: run the migrations, deploy the API, wait until no old API instance is serving, then publish the app.
GitHub Pages publishes on a push to `main`, so merge only after the API is live. Roll back the other way
round: the app first, and never the API below the published app.

Since phase 2, `GET /api/data` lists `features`: what the API can store beyond 1.9.0. An account's app offers
a mode only when its API lists what the mode saves (`needs` in `modes.ts`), and offers no choice of mode
until the API lists `taskMode`. An API before 1.10.0 lists nothing, so its students see Classic only. The
sync engine also leaves unlisted fields out of every request (`forApi` in `src/sync/engine.ts`), so data
that arrives another way (a backup import, a change made before an API rollback) is not refused or resent.
The app learns the list on each load and on a recheck with nothing unsaved; an API upgraded or rolled back
while a tab is open with unsaved changes is picked up at the next load. Guests keep everything in the browser and see every mode. Each new field
or record kind adds a feature name (`FEATURES` on the server, `API_FEATURES` in the app, checked by
`tests/contract.test.ts`) and the mode that needs it says so. The deploy order above still applies to new
fields a mode does not gate.

## Performance

An account holds at most 5,000 tasks. Grouping, workload sums and free-window matching are
linear passes over the store, done in render or `useMemo`. Drag and drop (Flow) reuses
`@dnd-kit`, already used by the calendar. Charts are SVG and CSS; no chart library is added.
