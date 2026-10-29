# College Hub

A student dashboard that puts your class schedule, deadlines, notes and grades in one place. Built for DLSU students first.

> Status: early development. V1 is in progress.

<!-- Add a demo GIF here once the hero banner works: ![demo](docs/screenshots/demo.gif) -->

## Why this exists

Students juggle a timetable app, a to-do app, a notes app and a grade spreadsheet. College Hub connects them. The schedule drives the hero banner. Tasks drive Study Mode. Class sessions link to notes.

## V1 features

- [ ] **Hero banner** that changes with the time of day (in class, between classes, study mode)
- [ ] **Weekly schedule** with color-coded courses and recurring classes
- [ ] **Assignments and to-dos** with an urgency engine (overdue, due today, this week, later)
- [ ] **Canvas sync** by importing an iCal (.ics) feed or file
- [ ] **What-if grade calculator** with weighted components
- [ ] **Notes** in markdown linked to class sessions

## Tech stack

| Area | Choice | Why |
| --- | --- | --- |
| Framework | React 19 + TypeScript + Vite | Fast dev loop and strict types |
| Styling | Tailwind CSS v4 + Lucide icons | Clean modern UI without custom CSS sprawl |
| State | Zustand | Small API and easy persistence |
| Storage | Browser localStorage / IndexedDB | No backend needed and works offline |
| Canvas | iCal (.ics) parser | Works without university IT or OAuth |
| Tests | Vitest + Testing Library | Same config as Vite |
| Lint | Oxlint | Very fast |
| CI | GitHub Actions | Lint, test and build on every push |

More detail in [docs/decisions.md](docs/decisions.md).

## Getting started

```bash
git clone https://github.com/<your-username>/college-hub.git
cd college-hub
npm install
npm run dev
```

Open the local URL that Vite prints.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run Oxlint |
| `npm test` | Run Vitest in watch mode |
| `npm run test:run` | Run tests once |
| `npm run check` | Lint + test + build (run before pushing) |

## Project structure

```
src/
  app/            App shell and layout
  components/ui/  Shared UI pieces (buttons, cards, modals)
  features/
    hero/         Hero banner and the time-state engine
    schedule/     Weekly grid and class detail drawer
    assignments/  Task tracker and .ics import
    grades/       Grade math and what-if simulator
    notes/        Notes hub
  store/          Zustand stores
  lib/            Pure helpers (time, storage)
  data/           Demo seed data
  types/          Shared TypeScript types
  test/           Test setup
docs/             Architecture notes, decisions and screenshots
```

## Roadmap

1. Hero banner time-state engine with tests
2. Weekly schedule grid
3. Assignments tab and .ics import
4. Grade calculator
5. Notes, PWA install and polish
6. Deploy and gather feedback from DLSU students

## License

MIT
