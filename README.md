# College Hub

A student dashboard that puts your class schedule, deadlines, notes and grades in one place. Built for DLSU students first.

> Status: V1 is built. Next up is feedback from DLSU students, a PWA install and polish.

![Overview](docs/screenshots/overview.png)

<!-- Add a demo GIF here: ![demo](docs/screenshots/demo.gif) -->

## Why this exists

Students juggle a timetable app, a to-do app, a notes app and a grade spreadsheet. College Hub connects them. The schedule drives the hero banner. Tasks drive Study Mode. Class sessions link to notes.

## V1 features

- [x] **Hero banner** that changes with the time of day. It shows the class in session with a progress bar, the next class with a countdown, or study mode with your most urgent tasks. A live clock face marks the stretch to the next class.
- [x] **Weekly schedule** with color-coded courses and recurring classes. Click an empty slot to add a class, pick several days at once, and get a warning when two classes overlap. A class detail drawer shows the room, professor, office hours, notes and open work.
- [x] **Assignments and to-dos** with an urgency engine (overdue, due today, this week, later), course filters, quick add and undo on delete.
- [x] **Canvas sync** by importing an iCal (.ics) file or pasted feed text. Course tags like `[FNDSTAT-A]` match your courses and re-importing skips what you already have.
- [x] **What-if grade calculator** with weighted components, the average you need on the rest, a what-if slider for each ungraded item, term GPA, cumulative GPA, a target planner and an editable grading scale.
- [x] **Notes** in markdown linked to class sessions. Take notes for the class in session straight from the hero banner.

Also in V1: sign in with Google (or continue without an account), search across courses, tasks, classes and notes (press `/`), light and dark mode (or follow the system), and sample data you can clear or restore. Signed-in students' data is saved to their account and follows them to every device. Guests save to their browser.

## Tech stack

| Area | Choice | Why |
| --- | --- | --- |
| Framework | React 19 + TypeScript + Vite | Fast dev loop and strict types |
| Styling | Tailwind CSS v4 + Lucide icons | Clean modern UI without custom CSS sprawl |
| State | Zustand | Small API and easy persistence |
| Storage | PostgreSQL for accounts, browser localStorage for guests | Data follows the student, and an account stays optional |
| Accounts | Express 5 + PostgreSQL (PGlite locally), Google sign-in checked on the server, cookie sessions | See [docs/backend.md](docs/backend.md) |
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

### Sign in with Google (optional)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client ID of type **Web application**.
2. Under **Authorized JavaScript origins**, add `http://localhost:5173` and your deployed origin, `https://laxed-college-hub.vercel.app`.
3. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID`.
4. For the deployed site, set `VITE_GOOGLE_CLIENT_ID` in Vercel (Project Settings, Environment Variables) and redeploy. For the GitHub Pages mirror, add a repository variable named `GOOGLE_CLIENT_ID`.

Without a client id the login page still works, and students can continue without an account.

The [Privacy Policy](public/privacy.html) and [Terms of Service](public/terms.html) are static pages in `public/`, and `index.html` links to them in plain HTML, so Google's homepage check finds them without running JavaScript. On the OAuth consent screen use `https://laxed-college-hub.vercel.app/`, `/privacy.html` and `/terms.html`.



### Email accounts and admin roles (optional)

An accounts API in `server/` adds email and password sign-up and login, plus **admin** and **user** roles. Admins get an Admin page to manage accounts. No database install is needed locally:

```bash
npm run dev:api   # API on :8787, with an embedded Postgres and test accounts
npm run dev       # app on :5173, which proxies /api to the API
```

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@collegehub.test` | `Admin-Test-2026!` |
| User | `student@collegehub.test` | `Student-Test-2026!` |

These test accounts are created only outside production. Security design, database schema, setup, hosting limits and backups are in [docs/backend.md](docs/backend.md).

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
| `npm run dev:api` | Start the accounts API and reload it on changes |
| `npm start` | Start the accounts API (production) |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:seed` | Create the test accounts (refused in production) |
| `npm run db:create-admin` | Create or promote an admin from `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` |

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
server/           Accounts API (Express, Postgres, sessions, RBAC) and migrations
docs/             Architecture notes, decisions, backend guide and screenshots
```

## Roadmap

1. ~~Hero banner time-state engine with tests~~
2. ~~Weekly schedule grid~~
3. ~~Assignments tab and .ics import~~
4. ~~Grade calculator~~
5. ~~Notes~~
6. PWA install and polish
7. Deploy and gather feedback from DLSU students
8. Canvas URL sync through a small proxy, and walk time between buildings

## License

MIT
