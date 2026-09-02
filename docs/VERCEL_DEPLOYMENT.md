# Vercel Server Deployment

## Architecture

The Vercel deployment runs the Next.js application with its server runtime enabled. This is required for:

- PostgreSQL access through `DATABASE_URL`
- issuer cookie sessions and password reset
- Next.js API routes and the `proxy.ts` route guard
- optional hosted AI providers

GitHub Pages is no longer a supported production target for this server-capable configuration because it cannot execute database or authentication APIs. Use Vercel for the application deployment.

## Build settings

Vercel auto-detects Next.js, so no `vercel.json` is required. Configure the project with:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Build command | `npm run build:vercel` (or leave the default `next build`) |
| Install command | `npm install` |
| Output directory | (leave empty — managed by the Next.js builder) |
| Node.js version | 20.x |

Do not set `output: "export"`; [next.config.js](../next.config.js) intentionally keeps the Next.js server runtime enabled.

Route handlers that touch PostgreSQL declare `export const runtime = "nodejs"`. Do not switch them to the Edge runtime — the `pg` driver requires Node.js.

## Required environment variables

```env
DATABASE_URL=postgresql://...
PASSWORD_RESET_BASE_URL=https://your-project.vercel.app
PASSWORD_RESET_WEBHOOK_URL=https://your-email-service.example/password-reset
```

Optional:

```env
DATABASE_POOL_MAX=5
PASSWORD_RESET_WEBHOOK_SECRET=...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
AGENT_PROVIDER=openai
OPENAI_API_KEY=...
AGENT_MODEL=gpt-4o-mini
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=your-deployment
AZURE_OPENAI_API_VERSION=2024-10-21
```

Never prefix database, provider, password-reset, Supabase service-role, or webhook secrets with `NEXT_PUBLIC_`. Anything prefixed `NEXT_PUBLIC_` is inlined into the browser bundle.

Set each variable for the Production, Preview, and Development environments separately in **Project Settings → Environment Variables**. Preview deployments should point at a non-production database.

## Connection pooling

Vercel serverless functions scale horizontally, and each instance opens its own `pg` pool. Point `DATABASE_URL` at a pooled connection string (Supabase Supavisor, Neon pooled endpoint, or PgBouncer in transaction mode) and keep `DATABASE_POOL_MAX` low (2–5). A direct, unpooled Postgres connection will exhaust `max_connections` under load.

## Deployment procedure

1. Import the GitHub repository into Vercel.
2. Set the production environment variables in the Vercel project settings.
3. Apply the database migrations in order:

```sh
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f database/migrations/002_issuer_auth.sql
psql "$DATABASE_URL" -f database/migrations/003_supabase_auth.sql
```

4. Trigger a deployment (push to the production branch, or `vercel --prod`).
5. Verify:

```sh
curl -i https://your-project.vercel.app/api/health/db
curl -i https://your-project.vercel.app/api/health/supabase
```

6. Register a test issuer, log in, create a reset request, and verify that the configured webhook receives the reset event.

## API endpoints

All server logic is served by Next.js App Router route handlers under `app/api`. There is no separate function directory.

| Purpose | Route | Method | Auth |
| --- | --- | --- | --- |
| Database health | `/api/health/db` | GET | public |
| Supabase health | `/api/health/supabase` | GET | public |
| Credential issuance | `/api/issue` | POST | public |
| Credential persistence | `/api/credentials` | GET, POST | issuer session |
| Credential verification | `/api/verify` | POST | public |
| Revocation | `/api/revocation` | GET, POST | issuer session |
| Issuers | `/api/issuers` | GET, POST | issuer session |
| Templates | `/api/templates` | GET, POST | issuer session |
| Auth | `/api/auth/*` | POST, GET | mixed |
| AI agent | `/api/agent` | POST | public |
| Agent analytics | `/api/agent/analytics` | GET, POST | issuer session |

## Troubleshooting

- `503 Database unavailable`: check `DATABASE_URL`, migration state, SSL requirements, and connection limits.
- `too many connections` / intermittent 503s: switch `DATABASE_URL` to a pooled connection string and lower `DATABASE_POOL_MAX`.
- Auth route fails during static export: use the Vercel build, not `build:github-pages`.
- Reset email not delivered: check webhook URL, bearer secret, webhook response status, and the Vercel function logs under **Deployments → Runtime Logs**.
- Do not set `PASSWORD_RESET_WEBHOOK_URL` to `/api/auth/reset-request`; that route creates reset tokens and is not an email sender. Use an external email webhook or an email provider endpoint.
- AI falls back to local responses: check `AGENT_PROVIDER` and server-only provider credentials.
