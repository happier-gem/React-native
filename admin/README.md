# Subscription Tracker Admin

Web admin for the Subscription Tracker mobile app, which lives in the parent folder of this repo. Next.js 16 (App Router), Clerk for auth, Supabase (Postgres) for data. It has its own `package.json` and `node_modules`; run `npm install` here, and start it from the repo root with `npm run admin` or from this folder with `npm run dev`. The mobile app's TypeScript, ESLint and Metro all ignore this folder.

## Setup

1. **Clerk** — use the same Clerk application as the mobile app.
   - `cp .env.example .env.local` and fill in `CLERK_SECRET_KEY` (Clerk Dashboard → API Keys). The publishable key must match the mobile app's.
2. **Supabase** — create a project, open the SQL editor, and run [`supabase/schema.sql`](supabase/schema.sql). Then set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (Project Settings → API Keys → secret key). Server-side only.
3. **Make yourself an admin** — Clerk Dashboard → Users → your user → Public metadata → `{"role": "admin"}`. Sign out and back in afterwards so the change is picked up.
4. `npm run dev` → http://localhost:3000

## How access control works

- `proxy.ts` only sends signed-out visitors to `/sign-in`.
- Authorization is `lib/admin-auth.ts` (`requireAdmin()` for pages/actions, `checkAdmin()` for API routes). It reads `publicMetadata.role` from Clerk on the server. Every admin page, server action, and API route must call it — layouts alone are not enough.
- `lib/supabase-admin.ts` uses the Supabase secret key, which bypasses Row Level Security. The tables have RLS enabled with no policies, so nothing else can reach them.
