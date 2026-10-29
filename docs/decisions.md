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
