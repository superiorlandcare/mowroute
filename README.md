# MowRoute

Mobile-first route + billing tool for a small landscaping crew. Built on
Next.js (App Router, TypeScript), Tailwind, and Supabase.

The source of truth is [`docs/CLAUDE_CODE_SPEC.md`](docs/CLAUDE_CODE_SPEC.md);
[`docs/MowRoute.jsx`](docs/MowRoute.jsx) is the visual prototype. It is built in
the phases listed in §15 of the spec.

## Status

**Phase 1 — Foundation** (done): database schema + RLS, Supabase auth with
admin/crew role gating, the `/login` screen, and route protection. The Mow
board, Setup, and Billing screens come in later phases.

## Getting started

### 1. Create the Supabase project + run the migration

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and
   run it. This creates every table, the RLS policies, and the realtime setup.

### 2. Seed the first admin (Katy)

There is no public signup — admins create accounts. To bootstrap the owner:

1. Supabase dashboard → **Authentication → Users → Add user**. Enter Katy's
   email + password and tick **Auto Confirm User**.
2. In the SQL editor, run (swap in her email):

   ```sql
   insert into profiles (id, full_name, role)
   select id, 'Katy', 'admin' from auth.users where email = 'katy@example.com'
   on conflict (id) do update set role = 'admin', full_name = excluded.full_name;
   ```

To test crew role gating, repeat for a second user with `'crew'` instead of
`'admin'`. (The same snippets are included at the bottom of the migration file.)

### 3. Configure environment + run

```bash
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# (Supabase dashboard → Settings → API)
npm install
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/login`. Sign in as Katy
(admin) — you'll see the Setup/Billing links. Sign in as the crew user — those
links are hidden, and visiting `/setup` or `/billing` redirects you back home.

## What to verify before building more

- Unauthenticated requests redirect to `/login`.
- Admin login lands on `/` with Setup + Billing access.
- Crew login lands on `/`; `/setup` and `/billing` redirect to `/` (role gating).
- In the Supabase API docs / SQL editor, a crew token cannot insert or update
  `customers`, `services`, or `invoices` (enforced by RLS, not just the UI).

## Project layout

| Path | Purpose |
|---|---|
| `supabase/migrations/0001_init.sql` | Schema (§4) + RLS (§5) + realtime (§6) — paste into Supabase. |
| `lib/supabase/{client,server,proxy}.ts` | Browser / server / proxy Supabase clients. |
| `lib/auth.ts` | `getSessionProfile`, `requireUser`, `requireAdmin`. |
| `proxy.ts` | Session refresh + auth redirects (Next 16 renamed `middleware` → `proxy`). |
| `app/login/` | Email + password sign-in. |
| `app/page.tsx` | Authenticated home (Mow board placeholder until Phase 3). |
| `app/{setup,billing}/` | Admin-only route stubs (full screens in Phases 2 & 6). |
