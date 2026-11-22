# Accounts backend

College Hub has an accounts API in `server/`. It adds email and password sign-up and login, and two roles: **admin** and **user**. Google sign-in and "Continue without an account" still work as before. Courses, tasks, notes and grades still live in the browser. The API stores only accounts.

```
Browser ──/api/*──> Vercel Function (prod) or Vite proxy (dev) ──> Express API (server/) ──> PostgreSQL
                    Same origin, so the session cookie is first-party.
```

| Piece | Choice |
| --- | --- |
| Runtime | Node 22.18+ (24 recommended). It runs the `.ts` files directly through type stripping, so there is no build step. |
| HTTP | Express 5 and Helmet |
| Database | PostgreSQL 15+ in production. PGlite (Postgres compiled to WASM) for local dev and tests, so you do not need to install anything. |
| Validation | Zod, with strict schemas that reject unknown keys |
| Passwords | scrypt from `node:crypto` (memory-hard, with no native addon) |
| Sessions | Opaque random token in an HttpOnly cookie, stored server-side as a SHA-256 hash |

## Quick start (local)

```bash
npm install
npm run dev:api   # API on http://127.0.0.1:8787, creates server/.data/ and the test accounts
npm run dev       # app on http://localhost:5173, which proxies /api to the API
```

Open the app and sign in with a test account (see [Test accounts](#3-test-accounts)). To change settings, copy `.env.server.example` to `.env.server.local`. `npm run dev:api` loads it automatically.

## 1. Authentication and security

### Password hashing

- **scrypt** with N=2^17, r=8, p=1 and a 64-byte key. These are the OWASP Password Storage Cheat Sheet parameters. Each hash takes about 128 MB of RAM and 0.2 to 0.5 s.
- A random 16-byte salt for each password. The stored format is `scrypt$N$r$p$salt$hash`, so the cost can rise later. If `SCRYPT_N` goes up, each user's hash is upgraded the next time they log in (`needsRehash`).
- Passwords are NFKC-normalized before hashing. Comparison uses `timingSafeEqual`.
- When the email is unknown, login still runs scrypt against a dummy hash. Response time then does not reveal which emails have accounts.
- Password rules follow NIST SP 800-63B: 10 to 128 characters, a block list of common passwords, at least 4 distinct characters, and the password must not contain the email name. There are no forced composition rules.

### Session and token management

- At login or sign-up the server creates 32 random bytes (256 bits) and sends them as a cookie:
  - `__Host-sid` in production. The `__Host-` prefix makes the browser require `Secure`, `Path=/` and no `Domain`.
  - `HttpOnly`, so page scripts cannot read it, and `SameSite=Lax`.
- The `sessions` table stores only `sha256(token)`. Someone with a copy of the database cannot replay sessions.
- Sessions end at the first of these:
  - logout
  - `SESSION_IDLE_HOURS` (24) without a request
  - `SESSION_TTL_HOURS` (168) after login
  - a password change, which signs out every other device
  - an admin changing the user's role or disabling them, which signs out all of their devices
- Each login issues a new token, which prevents session fixation. An hourly job deletes expired rows.
- **Why not JWTs?** A server-side session can be revoked at once (logout, ban, role change). A stateless JWT stays valid until it expires. The app is a single origin talking to one API, so cookies are simpler and safer than tokens in `localStorage`, where any XSS bug could steal them.

### Role-based access control

- `roles` table: `admin` and `user`. Each user has one `role_id`.
- `requireAuth` and `requireRole('admin')` middleware in `server/http.ts` guard routes. All of `/api/admin/*` is admin-only.
- Sign-up always creates a `user`. There is no way to grant yourself admin. To make an admin, an existing admin uses the Admin page, or the operator runs `npm run db:create-admin`.
- Guard rails: an admin cannot demote or disable themselves, and the last active admin cannot be removed.
- The UI hides the Admin page from non-admins, but the server is the real check: `#admin` falls back to Overview, and the API answers 403.

### Input validation

- Every body is parsed with a strict Zod schema (`server/validation.ts`). Unknown keys such as `"role": "admin"` are rejected with 400.
- Emails are trimmed, lower-cased and checked against a 254-character limit. A case-insensitive unique index (`lower(email)`) backs this up.
- Names are 1 to 60 letters, numbers, spaces and `. , ' -`. Markup and control characters are rejected.
- JSON bodies are capped at 10 KB. Wrong content types get 415. All SQL is parameterized.
- Errors come back as `{ error, fields }`. The login form shows each field's error under that field.

### Abuse protection

| Control | Limit |
| --- | --- |
| Login attempts per IP | 20 per 15 min |
| Login attempts per email | 10 per 15 min |
| Sign-ups per IP | 10 per hour |
| Account lockout | 15 min after 10 failed logins in a row |

Wrong password, unknown email and disabled account all get the same message: "Incorrect email or password." The rate limiter lives in the database, so every instance shares it. Sign-up does say when an email is already registered, which is the usual trade-off for clear UX. The rate limits keep that from being useful for enumeration.

### CSRF, headers and logging

- **CSRF:** `SameSite=Lax` cookies. On top of that, every `POST`, `PATCH` and `DELETE` must be JSON, and a browser `Origin` header must be in `APP_ORIGIN`.
- **Headers (Helmet):**
  - `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
  - `X-Content-Type-Options: nosniff`
  - HSTS for 2 years in production
  - `Cache-Control: no-store`
  - no `X-Powered-By`
- **Audit log:** sign-ups, logins, failed logins, password changes and admin edits go to `audit_log`. Admins see them on the Admin page.
- **Request logs** record the method, path, status and time only. They never include bodies, cookies or query strings.

### HTTPS and SSL readiness

The app is ready for HTTPS. Turn it on like this:

1. **Terminate TLS at the host (recommended).** Vercel, Render, Fly and Railway all give automatic Let's Encrypt certificates. Set `TRUST_PROXY=1` so the API trusts `X-Forwarded-Proto` and the real client IP.
2. In production, `FORCE_HTTPS` defaults to on. Plain-HTTP `GET` requests get a 308 redirect to HTTPS, and other plain-HTTP requests are refused. `/api/health` is exempt so platform health checks keep working.
3. Cookies are `Secure` and use the `__Host-` prefix, and HSTS is sent. Browsers will not send the session over HTTP.
4. **Running on your own VM** with no proxy: set `TLS_CERT_FILE` and `TLS_KEY_FILE` (for example, Let's Encrypt `fullchain.pem` and `privkey.pem` from certbot). The server then speaks HTTPS itself, with TLS 1.2 as the minimum. Restart it after certificates renew.
5. **Database:** use `sslmode=verify-full` (or `require`) in `DATABASE_URL`. Managed Postgres providers support this by default.

## 2. Database

### Schema

Defined in `server/migrations/001_users_roles_sessions.sql`.

```
roles        id smallint PK, name text UNIQUE ('admin' | 'user'), description
users        id uuid PK, email (unique on lower(email)), name, password_hash,
             role_id → roles, is_active, failed_logins, locked_until,
             last_login_at, created_at, updated_at
sessions     id text PK (sha256 of token), user_id → users ON DELETE CASCADE,
             created_at, last_seen_at, expires_at, ip, user_agent
audit_log    id bigint identity PK, actor_id → users, target_id → users,
             action, detail jsonb, ip, created_at
schema_migrations  name PK, applied_at
```

`CHECK` constraints enforce the email and name lengths again inside the database. Indexes cover `lower(email)`, `role_id`, `sessions.user_id`, `sessions.expires_at` and `audit_log.created_at`.

A role can only be one of the two rows in `roles`, so adding a role (for example `instructor`) is just a new migration plus a new `requireRole(...)`.

### Migrations

- Files are named `server/migrations/NNN_name.sql`. Each runs once, in order, inside a transaction, and is recorded in `schema_migrations`.
- The API runs pending migrations on start. You can also run them yourself with `npm run db:migrate`.
- Never edit a migration that has already shipped. Add a new one.

### Setup steps

**Local (zero install):** leave `DATABASE_URL` unset. Data lives in `server/.data/pglite`, which is git-ignored. Delete that folder to start fresh. PGlite allows only one process at a time, so stop `dev:api` before running `db:*` scripts.

**Local with real Postgres (optional):**

```bash
docker run -d --name college-hub-db -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17
echo "DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres" >> .env.server.local
npm run dev:api
```

**Production:**

1. Create a managed Postgres 15+ database. Neon, Supabase, Render Postgres, Railway, AWS RDS or Google Cloud SQL all work.
2. Create a dedicated role for the app. Do not use the superuser.

   ```sql
   CREATE ROLE college_hub_app LOGIN PASSWORD '<long random>';
   CREATE DATABASE college_hub OWNER college_hub_app;
   -- A read-only role for backups:
   CREATE ROLE college_hub_backup LOGIN PASSWORD '<long random>';
   GRANT pg_read_all_data TO college_hub_backup;   -- Postgres 14+
   ```

3. Set `DATABASE_URL=postgres://college_hub_app:…@host:5432/college_hub?sslmode=verify-full` on the API host.
4. Deploy. Migrations run during the production build.
5. Create the first admin:

   ```bash
   ADMIN_EMAIL=you@dlsu.edu.ph ADMIN_NAME="Your Name" ADMIN_PASSWORD='<strong>' \
   NODE_ENV=production DATABASE_URL=… npm run db:create-admin
   ```

   If the email already has an account, it is promoted instead.

## 3. Test accounts

Outside production, the API creates these accounts on start, unless `SEED_TEST_ACCOUNTS=false`. You can also run `npm run db:seed`.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@collegehub.test` | `Admin-Test-2026!` |
| Regular user | `student@collegehub.test` | `Student-Test-2026!` |

- They use the reserved `.test` domain, so they can never be anyone's real email.
- Seeding only creates accounts that are missing. It never resets a password you changed.
- **Production refuses them.** With `NODE_ENV=production`, the server will not start if `SEED_TEST_ACCOUNTS=true`, and `db:seed` exits with an error. Use `db:create-admin` for real admins.
- For a shared staging server, change these passwords after the first login, or set `SEED_TEST_ACCOUNTS=false` and create staging accounts yourself.

The automated tests (`server/app.test.ts`, 30 tests) run the real API against an in-memory PGlite. They cover hashing, sign-up validation, login, logout, idle expiry, lockout, password change, RBAC (401/403), admin guard rails, CSRF, body limits and security headers. `npm run check` runs them in CI.

## 4. Deployment and hosting

### Topology

- **Frontend and API:** one Vercel project. `npm run build:vercel` writes the site and the API function to `.vercel/output` (Build Output API). The API is bundled to one plain JavaScript file, so it does not depend on how Vercel compiles TypeScript.
- **Database:** Neon Postgres in Singapore, connected through Vercel, which sets `DATABASE_URL`. The function runs in Singapore (`sin1`) too.
- **Migrations:** run at the end of a production build, never in the function. Concurrent deploys take turns. A production build without `DATABASE_URL` fails on purpose, which keeps the previous deployment live.
- **Previews:** migrate only when `MIGRATE_PREVIEW_DB=true` is set for Preview. Set it only if previews have their own database branch, never when they share production's.
- **Allowed origins:** taken from Vercel's system variables. Set `APP_ORIGIN` only to add more, such as a custom domain next to the main one.

The GitHub Pages mirror has no API, so email sign-in there shows "offline". The `Dockerfile` and `npm start` still work for hosting the API elsewhere.

### Runtime and resource limits

| Setting | Recommendation | Why |
| --- | --- | --- |
| Instance memory | **512 MB minimum**, 1 GB comfortable | Each concurrent scrypt hash uses about 128 MB. Node's base use is about 80 MB. |
| CPU | 0.5 to 1 vCPU | Hashing runs on libuv's 4-thread pool, so up to 4 logins hash in parallel. |
| Node heap | `--max-old-space-size=384` (set in the Dockerfile) | scrypt memory is outside the V8 heap, so leave headroom. Raise it with instance size. |
| `SCRYPT_N` | 131072. Use 65536 only below 512 MB. | A lower N is weaker but still acceptable. |
| `DB_POOL_MAX` | 10 for each instance | Keep `instances × pool` under your Postgres connection limit. Use the provider's pooler (PgBouncer) on Neon or Supabase. |
| Instances | Any number | Rate limits live in the database, so every instance shares them. |
| Timeouts | Built in: 30 s request, 20 s headers, 65 s keep-alive. JSON body limit 10 KB. | Stops slowloris clients and oversized payloads. |
| Health check | `GET /api/health` (checks the database) | Used by Docker `HEALTHCHECK` and platform probes. |
| Shutdown | `SIGTERM` finishes in-flight requests, closes the pool and exits within 10 s | Deploys and restarts never cut a request in half. |
| Restart policy | Always restart on failure | `docker run --restart unless-stopped`, or the platform default. |

### Automated database backups

Use two layers:

1. **Provider backups (primary).** Turn on daily snapshots plus point-in-time recovery (PITR) with at least 7 days of retention. Neon, Supabase Pro, Render Postgres, RDS and Cloud SQL all offer this. PITR lets you restore to the minute before a bad change.
2. **Independent encrypted dumps (secondary).** These protect against losing the provider account or a region. `.github/workflows/db-backup.yml` runs `server/scripts/backup.sh` nightly at 02:17 Manila time. Each run:
   - runs `pg_dump --format=custom`
   - encrypts the dump with AES-256 through `gpg`. Dumps contain password hashes and emails, and this repo is public, so they are never stored unencrypted.
   - checks that the encrypted file decrypts and lists, so a broken backup fails the job
   - uploads it as a workflow artifact kept for 30 days

   To turn it on, add the repository variable `BACKUPS_ENABLED=true` and the secrets `DATABASE_URL` (the read-only backup role) and `BACKUP_PASSPHRASE`. Store the passphrase in a password manager too: without it, the backups cannot be read. For longer retention, copy the file to S3 or R2 with a lifecycle rule.

**Restore drill (do it once a term):**

```bash
gpg --batch --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" -d college-hub-….dump.gpg > restore.dump
pg_restore --clean --if-exists --no-owner -d "$STAGING_DATABASE_URL" restore.dump
```

Then point a staging API at that database and log in. A backup you have never restored is only a hope.

### Production checklist

- [ ] `NODE_ENV=production`, `DATABASE_URL` set with `sslmode=verify-full`, `APP_ORIGIN` set to the real site, `TRUST_PROXY=1`
- [ ] `https://<site>/api/health` returns `{"ok":true}`
- [ ] First admin created with `db:create-admin`, and no `.test` accounts exist
- [ ] Provider PITR is on, the backup workflow is on, and one restore has been tested
- [ ] **Update `public/privacy.html` and `public/terms.html`.** They currently say College Hub "has no server". With accounts, the server stores name, email, a password hash, role, sign-in times and IP addresses in the audit log and sessions. Say so, along with how long they are kept and how users can ask for deletion. This matters for Google OAuth verification and the Philippine Data Privacy Act.
- [ ] Error alerts are on (the platform's log alerts on `[api] Unhandled error`)
