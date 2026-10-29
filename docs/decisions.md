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

- **Canvas URL sync.** Browsers will probably block a direct fetch of a Canvas .ics URL (CORS). Fallback is importing the .ics file. Stretch goal is a small serverless proxy.
- **Grading scale.** DLSU uses terms and numeric grades. The grade calculator should follow that scale instead of A to F letters.
- **Walk time.** Needs a hand-built building-to-building table.

## Decision log

Add new entries below as the project grows. Format: date, decision, reason.
