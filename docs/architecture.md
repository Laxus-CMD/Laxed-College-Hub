# Architecture

## Data flow

```
Schedule (sessions) ──┐
                      ├──> getHeroState(now, sessions, tasks) ──> Hero banner
Tasks (assignments) ──┘

.ics file or feed ──> icsParser ──> Tasks store ──> Urgency engine ──> Task lists
Notes ──> linked to class session id + date
Grades ──> gradeMath (pure functions) ──> Score cards and what-if slider
```

## Hero state

`getHeroState(now, sessions, tasks)` returns one of three states:

| State | When | Shows |
| --- | --- | --- |
| `in-class` | A session is on right now | Course, room, minutes left, progress bar, Take notes |
| `between-classes` | The next class is later today and within 2 hours | Course, room, countdown |
| `study-mode` | Anything else | Up to 3 urgent tasks and the next class |

## Stores

| Store | Holds | Saved |
| --- | --- | --- |
| `useScheduleStore` | Courses and class sessions | Yes |
| `useTaskStore` | Tasks, including imported ones | Yes |
| `useNoteStore` | Markdown notes with course and session links | Yes |
| `useGradeStore` | Grade components, scale, overrides, targets, previous CGPA | Yes |
| `useSettingsStore` | Name and the sample data flag | Yes |
| `useUiStore` | Open dialogs, filters, selections, toast | No |

Deleting across stores goes through `store/actions.ts`. Each action takes a snapshot first so Undo can restore everything.

## Principles

- **Pure logic in `lib/` and `features/*/`.** Functions like the hero state engine take plain inputs and return plain outputs. They never read the clock themselves. This makes them easy to test with fixed dates.
- **Components stay thin.** They read from stores and render.
- **One store per concern.** Schedule, tasks, notes and settings each get their own Zustand store with persistence.
- **Demo mode.** `src/data/demo.ts` builds seed data from a given date, so the app is fully usable without any import and tests can pin the date.
- **Dialogs live in one place.** Any page opens a dialog by setting `useUiStore.dialog`, and `DialogHost` renders it.
