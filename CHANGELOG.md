# Changelog

Patch notes for College Hub. Newest first.

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
