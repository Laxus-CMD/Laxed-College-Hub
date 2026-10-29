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

## Principles

- **Pure logic in `lib/` and `features/*/`.** Functions like the hero state engine take plain inputs and return plain outputs. They never read the clock themselves. This makes them easy to test with fixed dates.
- **Components stay thin.** They read from stores and render.
- **One store per concern.** Schedule, tasks, notes and settings each get their own Zustand store with persistence.
- **Demo mode.** `src/data/` holds seed data so the app is fully usable without any import.
