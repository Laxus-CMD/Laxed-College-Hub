# Changelog

Patch notes for College Hub. Newest first.

## 1.10.0 · Tasks workspace

- Classic, Flow and Workload share one task list. Flow tracks progress, and Workload uses optional time estimates. Account workspaces use the features advertised by their API.
- **Deployment evidence (2026-11-25):** [PR #17](https://github.com/Laxus-CMD/Laxed-College-Hub/pull/17) merged at `711bd1a`. GitHub Pages reported a successful demo deployment and [Vercel reported a completed deployment for that commit](https://vercel.com/laxus3/laxed-college-hub/7rJ2qJkdAU8dpR7xMye4afT56mAW). That commit carried package version 1.9.0. The 1.10.0 version metadata and subsequent sync fixes await separate deployment verification. The provider status alone does not verify the custom-domain alias.

## 1.9.0 · 2026-11-24 · Academic calendar

### New

- **Schedule is now a calendar.** Classes and tasks together, by **Week** or **Month**, past and future. Arrows and **Today** sit in one toolbar with the view switch.
- **Deadlines get their own row.** Tasks due on a day without a set time sit in a row above your classes, which stays in view as you scroll. Tasks with a time appear at that time. Tasks without a date stay on your To-Do List.
- **Exams.** Mark a task as an exam (in the task form or straight from the calendar). Exams stand out with their own marker and border, and count toward your grade like assignments.
- **Clear at a glance.** Classes have a quiet tint and a thin line in their course color; assignments, exams and to-dos each have their own marker; finished tasks fade back. Today's column is lightly highlighted, and the hours shown fit your schedule.
- **Day details.** Click a date to open a panel beside the calendar with that day's classes, what is due, the free time between classes, and any clashes. Tick tasks off right there.
- **Drag to reschedule.** Drag a task to another day, to the deadline row, or to a time. The To-Do List updates at once, and Undo puts it back. You can still change the date in the task itself.
- **Details on hover and click.** Hover over a class or task for its full details. Click it for a small panel to edit it, or click an empty spot to add a task, an exam or a class there.
- **One list, two places.** Add, complete, rename, reschedule or delete a task on the calendar and the To-Do List changes too, and the other way round. Nothing is copied.
- **Display.** Show or hide classes, assignments, exams, to-dos, finished tasks and weekends. Your choices and view are remembered. If a hidden weekend has something on it, the toolbar says so.
- **Academic terms.** A class can have a first and last day. **Term** lets you end the current term on the day you choose: its classes stay on the calendar for the weeks they met. A class added after a term ended starts the next day. Classes added before this update meet every week, as before.

### Changed

- The Schedule tab is called **Schedule** (it was Weekly Schedule). Clicking a class shows its details first, with a button for its notes.
- The Today card and the top of Overview only show classes whose term covers the day.
- Focus no longer draws a ring around headings and panels that keyboard focus is moved to; every control still shows one.

### For operators

- Migrations `006_class_session_terms.sql` (first and last day of classes) and `007_task_category.sql` (exams) run during the production build. Older apps that save a class or task without these fields keep the saved values.

## 1.8.0 · 2026-11-24 · Study Launchpad

### New

- **Study Launchpad.** When there is no class now or soon, the top of Overview invites you to study instead of repeating your task list. **Start studying** opens Focus Space and starts a focus session (a session already running is left alone), and **Open tasks** goes to Tasks & Assignments. The next class is still shown underneath.
- **Continue where you left off.** Your last focus session, with its task, how long you focused and when, is shown next to it. **Continue** brings the task back in Focus Space and starts a fresh session; a countdown that ran out is never resumed. Only real sessions are shown: a finished focus interval, or one stopped after at least a minute. Until then you see a short note instead.
- **Time to rest.** Once every task on your list is done, the hero says so and suggests a break, with **Study anyway** if you want it. A student who has not added any tasks sees the normal welcome instead.

### Privacy

- The last session is kept in this browser, separately for each account. An account's record is removed from the browser when it signs out or its session ends, like the rest of its data.

## 1.7.0 · 2026-11-23 · Pomodoro timer and points-based grades

### New

- **Pomodoro timer** on Overview. Start a 25-minute focus session in one tap. The big countdown and a quiet ring show the time left, and the label always says **Focus** or **Break**, so color is never the only cue. One button goes from Start to Pause to Resume, and Reset sits apart from it.
- **Focus Space** opens the Overview timer in a distraction-free view. Use the expand button or F to enter, add an optional task, and press Escape to return. The same session keeps running in both views. Soft colors drift slowly behind the timer, a calm flow that never quite repeats, and stay still if your device asks for less motion.
- **Choose your rhythm:** 25/5, 50/10 or Custom, with a summary like "25 min focus · 5 min break". Custom shows two sliders, one for focus and one for break. Your choice is remembered in this browser.
- **Customize your dashboard.** Choose Customize on Overview to drag widgets into the order you want, with a mouse, by touch or with the keyboard, and to hide the ones you do not use. Hiding a widget only hides it: your tasks, notes, grades, schedule and timer are untouched, and showing it again puts it back where it was. Reset to default restores the original layout after asking first. Your layout is remembered in this browser, separately for each account.
- **Enter scores the way you get them back**, like 42 out of 50. Each component has Points earned and Total possible side by side, with Weight apart, and shows what it is worth as you type: 42/50 is 84% and adds 25.2 points to a component worth 30%.

### Improved

- **Timer that keeps time:** the ring and the digits come from the same clock, pause together, and are still right when you come back from another tab. New lengths during a session wait for the next interval, and the card says so. When focus ends, the break is ready to start and screen readers hear about it once, not every second.
- **Clear rules for scores:** total possible is 100 unless you change it, so percentages you already entered mean the same. An empty score is not graded yet, and a 0 counts. A total of 0 or less is explained next to the box and left out of your grade, the grade you need and the what-if until it is fixed. Boxes can be empty while you type.
- **Grades page, redesigned:** a summary at the top shows your current standing (the average of graded work only), and a bar shows how much of the course is locked in, graded and still open. Pending work is never counted as zero. Each component is a compact row with its score, percent and points, and a thin bar for how it went. Done, pending and needs-a-fix rows look different. Select a row to edit it; Escape or Done closes it. What-if and the grading scale are quieter.
- **Overview, rearranged by importance:** what is happening now and what is due come first, the timer and today's classes sit beside them, and the weekly overview, GPA and notes share an even row below. The layout follows the space it has rather than the window, so it stays balanced on phones, tablets, narrow windows and wide screens.
- **Tasks on Overview, refined:** flat rows with clear titles, quieter course badges and due dates (only overdue and due today get color), checkboxes that show a check on hover and spring in when done, and a footer that always sits at the bottom of the card. On a narrow card the course moves under the title. The columns beside it end on the same line, so the row below starts cleanly.
- **Pomodoro, refined:** a thinner ring that glides as time passes, a sliding control for 25/5, 50/10 and Custom, custom lengths that fold away, and four dots that count today's finished focus sessions. On a wider card the ring sits beside the controls.
- **Remove a component, then Undo in its place:** one tap brings back its score, total and weight, and keyboard focus goes straight to Undo.
- Buttons and boxes in both features are at least 44 pixels tall, and both work fully with a keyboard.

### Under the hood

- Database migration `005_grade_component_total.sql` adds `grade_components.total_score` (empty means 100, and the database refuses 0 or less). It runs during the production build.
- **Safe alongside older versions:** a component saved without a total, as versions before 1.7.0 do, keeps the total already saved, and the answer carries it back. Only an explicit empty total goes back to 100, so renaming a component in an old tab can no longer turn 42/50 into 42%.
- The timer is kept in this browser only (`college-hub.pomodoro`). A timer saved by an earlier version starts fresh.
- Dashboard layouts are kept in this browser as `college-hub.dashboard.<account or guest>`, versioned (`v: 1`) and checked against the list of widgets on every load, so new widgets appear and removed ones are ignored. Dragging uses dnd-kit (`@dnd-kit/core`, `sortable`, `utilities`).

## 1.6.0 · 2026-11-23 · Changes survive a reload

### New

- **Nothing typed is lost to a reload, a crash or a dropped connection.** While you are signed in, changes that have not reached your account yet are kept on this device and saved the next time you open College Hub, even if you were offline when you reloaded.
- **Delete from this device.** If someone was signed out before their changes were saved, the sign-in page says whose they are and lets anyone delete them. Useful on shared and lab computers.

### Improved

- **Save status says where your changes are:** saved to your account, kept on this device, or only in this tab. It only asks before you close the page when closing would really lose something.
- **Guests are warned when the browser will not save**, for example in some private windows, with a button to download a copy.
- Signing out without saving now says the changes are deleted from this device.

### Privacy

- The Privacy Policy explains that changes not yet saved to your account are kept in the browser until your account has them or you delete them.

## 2026-11-22 · More protection

### New

- **Sign out on all devices**, in **Your data**. For a lost phone or a shared computer left signed in. An account can be signed in on 10 devices at once.

### Security

- The build stops if a secret, a source map or an unknown `VITE_` setting would reach the browser. A test checks every file in the repository.
- A full Content Security Policy: pages only run the app's own scripts and Google sign-in, and only talk to College Hub and Google.
- The database connection always checks the server's certificate.
- [SECURITY.md](SECURITY.md) and monthly dependency updates.

## 2026-11-22 · Themes

### New

- **Five themes:** Matcha, Monochrome, Pink, Coffee and Navy, each with a light and a dark version. Open them with the palette button at the top, from **Your data**, or on the sign-in page. Live previews show each theme's real colors, and the choice is remembered in this browser.
- **Ceremonial Matcha is the new default.** If you picked Light, Dark or System before, that choice is kept.
- The Privacy Policy and Terms pages follow the theme.

### Fixed

- Closing a dialog by clicking outside it returns keyboard focus to where it was.

### Under the hood

- Palettes live in `public/themes.css` as CSS variables under `[data-theme]`. The tokens in `src/index.css` are built from them. Tests check that every palette is complete and readable, and that the first paint picks the right one.

## 2026-11-22 · Email accounts and admin roles

### New

- **Your data follows your account.** Signed-in students' courses, classes, tasks, notes and grades are saved to their account and show up on every device. Guests still save to their browser.
- **Bring your data with you.** After signing in, College Hub offers to add what is saved in this browser to your account.
- **Download my data** saves a backup file, and **Import data** reads it back.
- **New Privacy Policy and Terms** for accounts. Security log entries are deleted after 90 days.
- **Save status** in the sidebar, a warning when changes are not saved, and a question before closing the page with unsaved changes.
- **The API runs on Vercel** with the site, as one function. Migrations run during the deploy, and rate limits are shared by every instance.
- **Create an account with email and password**, or sign in to one, from the login page. Google and guest mode still work.
- **Admin page** for admin accounts. Search accounts, change roles, disable or enable accounts, and see recent sign-in activity.
- **Change password** from Your data. Other devices are signed out.
- **Accounts API** in `server/`, with PostgreSQL, hashed passwords, secure cookie sessions, rate limits and an audit log. It runs locally with no database install. See [docs/backend.md](docs/backend.md).
- **Test accounts** for development: `admin@collegehub.test` and `student@collegehub.test`.

## 2026-11-21 · Sign in with Google

### New

- **Login page.** Sign in with your Google account, or continue without one. Your first name fills in the greeting.
- **Account in Your data.** See which account you are using and sign out. Signing out keeps your data on this device.
- **Privacy Policy and Terms of Service** pages, linked from the login page and Your data.

## 2026-11-20 · UI refresh: light and dark mode

A cleaner, calmer look inspired by Apple's apps. Every feature works the same as before.

### New

- **Light and dark mode.** Pick Light, Dark or System from the bottom of the sidebar or from **Your data**. On phones, tap the sun or moon in the header. Your choice is saved and stays when you change pages or refresh, with no flash of the wrong theme on load.
- **Bottom tab bar on phones and tablets.** Overview, Schedule, Tasks, Grades and Notes are always one tap away.
- **Course chips on phones and tablets.** Scroll the row under search to filter tasks by course, or tap **+ Course** to add one.

### Improved

- **New design system.** Shared colors, type, spacing and corner radii, so cards, buttons, inputs, tabs and dialogs look and behave the same everywhere.
- **Typography.** Uses your device's system font (San Francisco on Apple devices, Segoe UI on Windows) with tighter, bolder headings.
- **Colors.** A single restrained blue accent instead of purple. Status colors (overdue, due soon, done) are tuned so they stay readable in both themes.
- **Sidebar.** Full height and slightly translucent, with an app mark, smaller menu rows and a cleaner course list.
- **Cards and surfaces.** Soft shadows in light mode and true black with raised gray cards in dark mode.
- **Controls.** Pill-shaped buttons, iOS-style segmented tabs, round checkboxes, and inputs with a soft focus ring.
- **Motion.** Dialogs, the class drawer, search results and toasts ease in. Pages fade in on change. All motion respects the system's Reduce Motion setting.
- **Deletes that need a second click** turn solid red on the confirm step.

### Removed

- The thin purple accent rail on the left edge of the page.
- The Poppins web font. The app no longer loads fonts from Google.

### Under the hood

- New `useThemeStore` (saved as `college-hub.theme`). An inline script in `index.html` applies the theme before the first paint.
- Colors are semantic CSS variables. Dark mode overrides them under `[data-theme='dark']`, so components need no `dark:` variants.
- New test covering the theme switch and that it is saved.

## 2026-10-29 · V1

First release: hero banner, weekly schedule, tasks and assignments with Canvas (.ics) import, grade and GPA calculator, and notes.
