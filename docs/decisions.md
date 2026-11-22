# Technical decisions

Short notes on why things are built the way they are.

| Component | V1 choice | Why |
| --- | --- | --- |
| Data persistence | Browser localStorage / IndexedDB | No backend setup and instant local performance |
| Canvas integration | iCal (.ics) parser | Works without university IT or OAuth permissions |
| Styling and UI | Tailwind CSS + Lucide icons | Clean modern look out of the box |
| State management | Zustand | Keeps schedule, tasks and notes in sync with little boilerplate |
| Testing | Vitest + Testing Library | Shares the Vite config |

## Open questions

- **Canvas URL sync.** Browsers will probably block a direct fetch of a Canvas .ics URL (CORS). V1 imports the .ics file or pasted text. Stretch goal is a small serverless proxy.
- **Grading scale.** The calculator uses 4.0 grade points (4.0 down to 0.0) and not A to F letters. The percent cutoffs are a placeholder because instructors set their own, so students can edit them. Confirm the official DLSU cutoffs before sharing widely.
- **Walk time.** Needs a hand-built building-to-building table. Not built yet.
- **Time zones in .ics files.** Times ending in `Z` are converted to the viewer's time zone. Times with a `TZID` are read as local time, which is right for a student on campus but wrong from abroad.

## Decision log

Add new entries below as the project grows. Format: date, decision, reason.

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-29 | Hero banner is "between classes" when the next class today is within 2 hours. Otherwise it is study mode. | Keeps the countdown for the stretch where it helps and gives free time to tasks. |
| 2026-10-29 | "This week" means the next 6 days after today. Seven or more days out is "later". | One rolling 7-day window matches the Next 7 days chart and avoids a Monday reset. |
| 2026-10-29 | A bare due date means the end of that day (23:59). | Matches how deadlines are usually meant, and avoids a fake "overdue" at midnight. |
| 2026-10-29 | Notes use a small markdown parser that builds a tree, with no HTML output. Links allow http, https and mailto only. | Nothing typed into a note can inject markup, and it adds no dependency. |
| 2026-10-29 | One Zustand store per concern, saved with `persist` through a storage wrapper that never throws. | The app keeps working when the browser blocks storage. |
| 2026-10-29 | Deleting a course removes its classes and grade components. Its tasks and notes stay, with no course. | Deadlines and notes are worth more than the course label. Every delete has an Undo. |
| 2026-10-29 | One dark theme, tuned for long study sessions. | Matches the first layout and avoids maintaining two palettes. |
| 2026-11-20 | Light and dark themes, plus System that follows the OS. Supersedes "One dark theme". Colors are semantic CSS variables that the dark theme overrides. | A light option suits daytime use and matches the Apple-style redesign. One token set keeps both themes consistent without `dark:` variants in every component. |
| 2026-11-21 | Sign in with Google through Google Identity Services in the browser, plus "Continue without an account". The ID token is decoded for the profile only. Data stays in localStorage and is not tied to the account. | No backend to verify tokens or store data yet. Sign-in personalizes the app today and gives a user id to sync against later. |
| 2026-11-22 | Email and password accounts with admin and user roles, served by an Express API in `server/` on PostgreSQL. Passwords use scrypt, and sessions are opaque tokens in HttpOnly cookies, stored hashed. The API is proxied under `/api` on the same origin. App data stays in localStorage. | Admins need server-enforced roles, which a browser-only app cannot provide. Server sessions can be revoked at once, unlike JWTs. Same-origin cookies avoid third-party cookie blocking. PGlite keeps local setup at zero installs. |
| 2026-11-22 | Student data is saved to the account through one load and one save request. Records keep the ids made in the browser, keyed per student. Last save wins, except that a note edited on two devices keeps both versions. | One transaction cannot leave a half-saved account. Browser ids make undo, import and retries simple. Losing a paragraph of notes is worse than having a copy to merge. |
| 2026-11-22 | Accounts need a connection. Their data is never written to the browser, and unsaved changes stay in memory with a warning before closing. | Shared and library computers must not keep a student's notes and grades. One copy on the server is simpler than two to merge. |
