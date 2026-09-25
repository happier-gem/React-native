# Subscription Tracker

A mobile app for tracking the subscriptions you pay for, with paid Starter/Pro
tiers bought through mobile money (INFI-PAY, MWK).

> **Status: not production-ready.** The INFI-PAY integration is built against a
> placeholder contract (no official docs or credentials yet), and the latest
> database migrations have not been applied to the real Supabase project. See
> [docs/payments.md](docs/payments.md#production-readiness).

## Architecture

```text
Mobile app (Expo)  ──HTTPS + Clerk session token──▶  Admin/API server (Next.js, admin/)
                                                        │            │
                                                        ▼            ▼
                                             Supabase (Postgres)   INFI-PAY
                                             secret key, server    server-only
                                             side only             credentials
```

- The **mobile app never talks to Supabase or INFI-PAY**. It only calls the
  admin/API server, authenticated with the user's Clerk session token.
- The **server is the authority** for prices, payment status, plan activation
  and expiry. The app only displays what `GET /api/me/plan` returns.
- **Supabase** tables have Row Level Security on with no policies, and the
  client roles have no table privileges: only the server's secret key can
  read or write data.

## Repository layout

| Path | What |
|---|---|
| `app/` | Mobile screens (expo-router file-based routes). `app/plans.tsx` is the plan/checkout screen. |
| `context/` | Mobile state: subscriptions, plan (`plan-context.tsx`), theme, currency, notifications. |
| `lib/` | Mobile API client, checkout controller (`payment-flow.ts`), plan display rules. |
| `components/`, `hooks/`, `constants/` | Mobile UI building blocks. |
| `__tests__/`, `lib/__tests__/` | Mobile tests (Jest + React Native Testing Library). |
| `admin/` | Next.js admin dashboard **and** the API the app calls. Own `package.json`. |
| `admin/app/api/` | API routes: subscriptions, payments, `me/plan`, webhook, internal recovery. |
| `admin/lib/` | Server logic: payments, INFI-PAY adapter, plan rules/activation, recovery, reconciliation. |
| `admin/supabase/` | `schema.sql` (fresh install), `migrations/` (existing databases), `verify.sql` (read-only check). |
| `docs/` | [Payments & operations](docs/payments.md), [device test checklist](docs/device-testing.md). |

## Setup

Requirements: Node 22, npm. Works on Windows, macOS and Linux.

### 1. Clerk

One Clerk application is shared by the app and the admin server. Make yourself
an admin: Clerk Dashboard → Users → you → Public metadata → `{"role": "admin"}`.

### 2. Supabase

- **New project:** run [`admin/supabase/schema.sql`](admin/supabase/schema.sql) in the SQL editor.
- **Existing project:** run the files in [`admin/supabase/migrations/`](admin/supabase/migrations/) in filename order.
- Then run [`admin/supabase/verify.sql`](admin/supabase/verify.sql). It is read-only; every row must show `ok = true`.

Details and the current deployment status: [docs/payments.md → Database](docs/payments.md#database).

### 3. Admin/API server

```bash
cd admin
npm install
cp .env.example .env.local   # fill in — see "Environment variables" below
npm run dev                  # http://localhost:3000  (or `npm run admin` from the repo root)
```

### 4. Mobile app

```bash
npm install
cp .env.example .env.local   # EXPO_PUBLIC_API_BASE_URL = your computer's LAN IP, e.g. http://192.168.1.20:3000
npm start                    # also: npm run android / ios / web
```

A physical phone can't reach `localhost` on your computer — use the LAN IP.

## Environment variables

**Mobile (`.env.local`, bundled into the app — public values only):**

| Variable | Notes |
|---|---|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_...`). |
| `EXPO_PUBLIC_API_BASE_URL` | Admin/API server URL reachable from the phone. |

Never put a Supabase key, Clerk secret, INFI-PAY credential or webhook secret in
an `EXPO_PUBLIC_*` variable — anything there ships inside the app.

**Admin/API (`admin/.env.local`, server-only):** see
[`admin/.env.example`](admin/.env.example) and the full checklist in
[docs/payments.md](docs/payments.md#environment-checklist).

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | Same Clerk app as mobile (public). |
| `CLERK_SECRET_KEY` | yes | Secret. |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | yes | Secret key bypasses RLS — server only. |
| `INFI_PAY_API_URL`, `INFI_PAY_API_KEY`, `INFI_PAY_WEBHOOK_SECRET`, `INFI_PAY_ENVIRONMENT` | for payments | All four or payments are disabled (fail closed). |
| `CRON_SECRET` | for recovery | Enables the scheduled recovery endpoint. |

## Payments and plans (summary)

Free / Starter (2,000 MWK) / Pro (5,000 MWK) per month — **prices are
provisional placeholders**, centralized in `admin/lib/plans.ts`.

```text
Plans screen → POST /api/payments/initiate (server sets the price) → INFI-PAY prompt on the phone
  → webhook (signature verified) or scheduled recovery (asks INFI-PAY) → payment SUCCESS
  → plan activated once, in one database transaction → app polls GET /api/payments/[id]
  → app refreshes GET /api/me/plan → shows the server's plan
```

Full flow, state machine, recovery, reconciliation and the open business/provider
decisions: **[docs/payments.md](docs/payments.md)**.

## Development

| | Mobile (repo root) | Admin (`admin/`) |
|---|---|---|
| Type check | `npx tsc --noEmit` | `npx tsc --noEmit` (run `npx next typegen` first on a fresh clone) |
| Lint | `npm run lint` | `npm run lint` |
| Tests | `npm test` (Jest) | `npm test` (Vitest, includes in-process Postgres tests) |
| Build | `npx expo export` | `npm run build` |

CI (`.github/workflows/ci.yml`) runs all of the above on every push/PR. The
builds need `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` as repository secrets.

After adding a mobile route, typed routes regenerate on the next `npm start`.

## Deployment notes

- Deploy `admin/` as a Next.js app (e.g. Vercel, root directory `admin`). Set
  the server env vars there — never in the mobile build.
- Schedule `GET /api/internal/payments/recover` every 5–10 minutes with
  `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this header automatically when `CRON_SECRET` is set).
- Register the webhook URL `https://<admin-host>/api/payments/webhook` with INFI-PAY once their contract is confirmed.
- Build the app with `EXPO_PUBLIC_API_BASE_URL` pointing at the deployed admin host (HTTPS).

## Troubleshooting (Windows): `TypeError: fetch failed` on `npm start`

On startup Expo CLI calls `api.expo.dev` to validate package versions; when that
request fails, Node reports a generic `TypeError: fetch failed`. The cause is
always the network, not this project. In order of likelihood:

1. **Flaky Wi-Fi/VPN/hotspot.** Re-run once the connection is stable. (The npm
   scripts already set `NODE_OPTIONS=--no-network-family-autoselection`, which
   helps on networks with unreliable IPv6.)
2. **Proxy variables.** Check `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` /
   `NO_PROXY` (`Get-ChildItem Env: | Where-Object Name -match 'PROXY'`).
3. **SSL-inspecting antivirus/firewall.** Point Node at your organization's root
   CA instead of disabling TLS: `$env:NODE_EXTRA_CA_CERTS = "C:\path\to\root-ca.pem"`.
4. **IPv6 route flapping.** `setx NODE_OPTIONS "--dns-result-order=ipv4first"`.
5. **Check outside Expo:**
   `node -e "fetch('https://api.expo.dev/v2/versions/latest').then(r=>console.log(r.status)).catch(e=>console.log(e))"`

Use `EXPO_OFFLINE=1 npx expo start` only ad hoc when you're genuinely offline —
not as a permanent setting.
