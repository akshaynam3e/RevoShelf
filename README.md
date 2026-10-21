# RevoShelf – campus marketplace

Students buy and sell used textbooks, calculators, electronics, stationery, lab supplies and hostel essentials on their own campus. Verified students only, private realtime chat, in-person exchanges. **No payments, wallet, escrow, shipping or fees.**

| Layer | Tech |
|---|---|
| `apps/web` | React 18, TypeScript, Vite, Tailwind, React Router, TanStack Query |
| `apps/api` | Node 20, Express, TypeScript, Zod, supabase-js (service role, server only) |
| `packages/shared` | Zod schemas, DTO types, constants (reusable by a future mobile app) |
| `supabase/` | SQL migrations (schema, constraints, indexes, RLS, storage, realtime) + dev seed |

> **Status honesty.** This repository was generated in an environment with **no network access**, so `npm install`, the type checks, the tests and the production builds were **never run**, and nothing has been deployed or tested against a real Supabase project. Treat the first run as a shakedown: follow *Verify locally* below and fix anything the compiler flags. See *Known limitations*.

---
## 1. Architecture & security model

* The browser talks to **Supabase Auth** (login, OAuth, session) and to the **Express API** (everything else). It also opens a **Realtime** subscription on `messages`/`conversations`, which is protected by RLS.
* The API verifies every bearer token with `supabase.auth.getUser(token)` (a call to Supabase Auth, never a local decode), then loads the caller's profile (`role`, `suspended`, `student_status`) **from the database** on every request. Roles are never read from the client or the JWT.
* The API uses the **service-role key**, which bypasses RLS, so **every route authorizes explicitly** (ownership filters, participant checks, admin middleware). RLS is a second layer protecting direct browser access.
* Client roles (`anon`, `authenticated`) have **no write privileges** anywhere and can only `SELECT`: public college/campus directory, their own profile row, and messages/conversations they participate in. Listings, favorites, reports, moderation and verification data are reachable only through the API.
* Privilege escalation is blocked three ways: no UPDATE grant on `profiles`, a trigger that rejects changes to `role/student_status/suspended` from client roles, and strict Zod schemas that reject unknown fields.
* Listing `seller_id` and `campus_id` are always set server-side (token + profile) and are immutable (trigger). Message `sender_id` always comes from the token (plus a DB trigger verifying participation).
* Uploads: size/count limits, **magic-byte sniffing** (JPEG/PNG/WebP only), server-generated paths, stored in Supabase Storage (never the API filesystem). Buckets have no client write policies.
* Hardening: Helmet, strict CORS allowlist, 50 KB JSON limit, global + per-route rate limits, DB-backed message rate limit (20/min/user), generic error responses, no logging of tokens, passwords or message bodies.

### Student verification
1. User picks college + campus (profile completion).
2. **Email path:** the account email must be *confirmed* and its domain must be on that college's admin-managed allowlist (`verified_email_domains`, subdomains allowed) → `verified`.
3. **Manual path** for unsupported colleges: user submits details → `pending` → an admin approves/rejects in the dashboard.
4. Email confirmation (`emailVerified`) is distinct from student verification (`student_status`). Signing in with Google never verifies anyone by itself; the user must still run step 2 or 3.
5. Listing and starting conversations require `student_status = 'verified'`.
6. A user's campus is locked once verification starts (prevents verifying for one campus and listing on another).

---
## 2. Local development

Prerequisites: Node ≥ 20, a Supabase project (free tier is fine).

```bash
git clone <your-repo> && cd revoshelf
cp .env.example .env            # fill in the values (see §3)
npm install                     # installs all workspaces; commit the generated package-lock.json
npm run dev:api                 # http://localhost:4000  (builds shared first)
npm run dev:web                 # http://localhost:5173  (second terminal)
```
Vite reads `VITE_*` variables from `apps/web/.env`: copy the three `VITE_*` lines there (or run `cp .env apps/web/.env`). The API reads the repo-root `.env` or `apps/api/.env`.

### Verify locally (do this first)
```bash
npm run typecheck   # shared build + API tsc + web tsc
npm test            # shared (vitest) + API (vitest/supertest, Supabase mocked)
npm run build       # production builds of shared, api, web
```
The API tests use an in-memory fake of the Supabase client, so they verify authorization/validation logic and the *shape* of queries (e.g. that marketplace queries filter `status = 'active'` and `campus_id`), **not** real Postgres/RLS behavior. Test RLS against your real project with the SQL snippets in §6.

---
## 3. Supabase setup (exact steps)

1. **Create project** at supabase.com → *New project*. Save the DB password somewhere safe (RevoShelf never needs it).
2. **Keys**: *Project Settings → API*. Copy `Project URL`, the **publishable (anon) key** → `VITE_SUPABASE_PUBLISHABLE_KEY`, and the **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY` (API only, never in the web app or git).
3. **Apply migrations**: SQL Editor → run `supabase/migrations/0001_schema.sql`, then `0002_rls_storage_realtime.sql`. (Or with the CLI: `supabase link --project-ref <ref> && supabase db push`.)
4. **Seed (dev only)**: run `supabase/seed.sql` for fictional colleges/campuses/domains (`example.edu`, `sample-college.ac.in`). In production, add your real colleges, campuses and domains from the **Admin → Directory** tab instead.
5. **Storage**: migration 0002 creates public buckets `listing-images` (5 MB) and `avatars` (2 MB), JPEG/PNG/WebP only, with read-only public policies. Confirm under *Storage*.
6. **Realtime**: migration 0002 adds `messages` and `conversations` to the `supabase_realtime` publication. Confirm under *Database → Replication*.
7. **Auth → URL Configuration**: *Site URL* = your web URL (`http://localhost:5173` locally, your Render URL in production). *Redirect URLs*: add `http://localhost:5173/**` and `https://<your-web>.onrender.com/**`.
8. **Auth → Providers → Email**: enable, and keep **Confirm email** ON (required for the email verification path).
9. **Google OAuth**: Google Cloud Console → APIs & Services → Credentials → *OAuth client ID (Web)*. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Paste Client ID/Secret into Supabase *Auth → Providers → Google* and enable.
10. **First administrator** (cannot be self-assigned from the app): sign up normally, then in the SQL Editor run  
    `update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');`
11. **SMTP**: Supabase's default mailer is heavily rate limited; configure custom SMTP under *Auth → SMTP* before real launch.

---
## 4. Deploy to Render

### Firebase Auth mode

The browser uses Firebase Authentication for email/password and Google login. Supabase remains the database and storage provider. After applying the first two migrations, also run `supabase/migrations/0003_firebase_auth.sql`. In Firebase Console, enable Email/Password (and Google if desired) under Authentication → Sign-in method, create a Web app, and copy its config into the `VITE_FIREBASE_*` variables. For the API, create a Firebase Admin service-account key and set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in the API environment. Store the private key with literal `\n` line breaks; never commit the JSON file or private key.

**Blueprint (recommended):** push to GitHub → Render → *New → Blueprint* → select the repo (uses `render.yaml`). Enter the `sync:false` variables when prompted.

| Service | Variable | Value |
|---|---|---|
| `revoshelf-api` (Web Service) | `SUPABASE_URL` | project URL |
| | `SUPABASE_SERVICE_ROLE_KEY` | service-role/secret key |
| | `CORS_ORIGINS` | `https://<revoshelf-web>.onrender.com` (comma-separate extra origins, no trailing slash) |
| | `NODE_ENV` | `production` (set in blueprint); `PORT` is injected by Render |
| `revoshelf-web` (Static Site) | `VITE_API_BASE_URL` | `https://<revoshelf-api>.onrender.com/api/v1` |
| | `VITE_SUPABASE_URL` | project URL |
| | `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable (anon) key |

Manual (no blueprint): API = Web Service, build `npm install --include=dev && npm run build:shared && npm run build -w @revoshelf/api`, start `npm run start -w @revoshelf/api`, health check `/health`. Web = Static Site, build `npm install --include=dev && npm run build:shared && npm run build -w @revoshelf/web`, publish dir `apps/web/dist`, and add a **Rewrite** rule `/*` → `/index.html` (SPA fallback; `public/_redirects` is also included for Netlify-style hosts).

After the first deploy: update Supabase *Site URL / Redirect URLs* (step 7) with the real web URL, and `CORS_ORIGINS` on the API. Free Render web services sleep when idle; the first request can take ~50 s.

---
## 5. API overview (`/api/v1`, JSON, `Authorization: Bearer <supabase access token>`)

Public: `GET /colleges`, `GET /listings`, `GET /listings/:id`, `GET /users/:id`, `GET /health` (root).
Account: `GET|PATCH /me`, `POST /me/avatar`, `POST /verification/email`, `POST /verification/manual`.
Listings (verified to create): `POST /listings`, `PATCH /listings/:id`, `POST /listings/:id/status`, `DELETE /listings/:id`, `POST|DELETE /listings/:id/images…`, `GET /me/listings`.
Favorites: `GET /favorites`, `PUT|DELETE /favorites/:listingId`.
Chat (verified to start): `POST /conversations`, `GET /conversations`, `GET /conversations/:id[/messages]`, `POST /conversations/:id/messages`, `POST /conversations/:id/read`.
Reports: `POST /reports`. Admin (`/admin/*`, role checked in DB): reports, listings, suspend/unsuspend, verification requests, moderation history, domains/colleges/campuses.

Errors: `{ "error": { "message", "code", "details?" } }`.

---
## 6. Manual RLS checks (run against your Supabase project)
In the SQL editor, impersonate a user to confirm isolation:
```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<user-uuid>","role":"authenticated"}', true);
select count(*) from public.messages;                       -- only messages in conversations that user is in
update public.profiles set role='admin' where id='<user-uuid>';  -- must fail: permission denied
insert into public.messages(conversation_id,sender_id,body) values ('<c>','<u>','x'); -- must fail
select * from public.verified_email_domains;               -- must fail / return nothing
```

---
## 7. Known limitations / things to review
* Nothing here was executed (no network in the build environment): expect to fix small type/config errors on first `npm run typecheck`. Dependency versions are my best choice of stable ranges, unverified against the registry.
* Search uses `ILIKE` with trigram indexes (good for campus-scale data). Swap to full-text search later if needed.
* Verification by email requires the *sign-up/OAuth email itself* to be on the allowlist; verifying a separate college address is not implemented.
* Suspending a user marks their active/reserved listings `removed`; unsuspending does not auto-restore them (restore individually in Admin → Listings).
* Direct Realtime delivery relies on RLS + the user's JWT; message *sending* goes through the API (intentional, so rate limits and checks apply).
* No email/push notifications; unread counts refresh via Realtime + 30 s polling.
* Hard-deleting a listing cascades to its conversations and messages.
* Rate limiting is per-instance memory (`express-rate-limit`); use a shared store if you scale horizontally.

## 8. Future clients (not built in this phase)
* **Android/iOS:** wrap `apps/web` with **Capacitor** (fastest; same code, add `@capacitor/camera` for photos), or build a **React Native/Expo** app reusing `packages/shared` and the same REST API + `@supabase/supabase-js`.
* **Desktop:** **Tauri** (small, Rust) or **Electron** around the built web app.
* The REST API is stateless and token-based, so mobile and desktop clients need no backend changes (add their redirect schemes to Supabase Auth redirect URLs).
