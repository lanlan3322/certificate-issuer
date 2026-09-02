# Vercel Database Setup

## 1. Provision the database

1. Provision a PostgreSQL database from the Vercel dashboard (**Storage → Create Database → Neon/Supabase**) or bring your own managed Postgres.
2. Copy the **pooled** connection URL. Serverless functions scale horizontally, so a direct, unpooled connection will exhaust `max_connections`.
3. Add `DATABASE_URL` in **Project Settings → Environment Variables** for Production, Preview, and Development. Point Preview at a non-production database.

## 2. Configure environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes for database APIs | Pooled PostgreSQL connection URL. |
| `DATABASE_POOL_MAX` | No | Maximum pooled connections per instance. Default: `5`. Keep low on serverless. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase only | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase only | Server-only key; bypasses row level security. |
| `AGENT_PROVIDER` | No | `openai`, `azure-openai`, `copilot-studio`, or omit for local assistant. |
| `OPENAI_API_KEY` | Provider dependent | Server-only OpenAI-compatible key. |
| `AZURE_OPENAI_API_KEY` | Provider dependent | Azure key; wire a dedicated Azure adapter before enabling. |
| `AGENT_MODEL` | No | LLM model name. Default: `gpt-4o-mini`. |
| `PASSWORD_RESET_WEBHOOK_URL` | Recommended | Server-side email delivery webhook for issuer password reset links. |
| `PASSWORD_RESET_BASE_URL` | Recommended | Public URL used to construct reset links, for example `https://your-project.vercel.app`. |
| `PASSWORD_RESET_WEBHOOK_SECRET` | Optional | Bearer token sent to the reset webhook for authenticating delivery requests. |

The webhook receives a JSON `POST` body:

```json
{
	"event": "issuer.password_reset_requested",
	"email": "issuer@example.com",
	"resetUrl": "https://your-project.vercel.app/issuer?mode=reset&token=...",
	"expiresInMinutes": 30,
	"requestedAt": "2026-08-17T12:00:00.000Z"
}
```

It must return a `2xx` response. The request includes `Authorization: Bearer <PASSWORD_RESET_WEBHOOK_SECRET>` when the secret is configured. Delivery has an eight-second timeout; a failed delivery returns an error rather than claiming that the email was sent.

Do not use this project&apos;s own `/api/auth/reset-request` URL as the webhook URL. That route processes reset requests; it does not send email and would recursively call itself. Configure an external email webhook instead.

Never use `NEXT_PUBLIC_` for database URLs, Supabase service-role keys, or AI provider keys — those values are inlined into the browser bundle.

Issuer registration and login require the Vercel server runtime and database migration `002_issuer_auth.sql`. Password reset requests are generic to prevent account enumeration. In production, configure `PASSWORD_RESET_WEBHOOK_URL` to deliver the generated reset link through an approved email provider; reset tokens are never returned to the browser in production. In local development, the API returns a development token to make the flow testable without an email provider.

## 3. Run migrations

Use a privileged PostgreSQL connection from CI or an operator shell. Vercel builds run in an ephemeral sandbox and should not apply migrations:

```sh
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f database/migrations/002_issuer_auth.sql
psql "$DATABASE_URL" -f database/migrations/003_supabase_auth.sql
```

Record applied migrations in your deployment pipeline. Do not run unreviewed migrations automatically against production.

## 4. Local development

1. Pull the project environment into a local `.env.local` file:

```sh
npx vercel env pull .env.local
```

Or set it manually:

```sh
DATABASE_URL=postgresql://...
DATABASE_POOL_MAX=5
```

2. Apply the migration to a local or isolated development database.
3. Run `npm run dev`.
4. Test `GET /api/issuers`, `GET /api/templates`, `GET /api/credentials`, and `POST /api/agent/session`.

The UI retains browser-only fallback behavior when server APIs are unavailable. Database features require the server-capable Vercel runtime; static GitHub Pages cannot serve these API routes.

For a new database, apply all migrations in order:

```sh
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f database/migrations/002_issuer_auth.sql
psql "$DATABASE_URL" -f database/migrations/003_supabase_auth.sql
```

## 5. Backup and recovery

- Enable your database provider&apos;s automated backups and verify retention meets organizational policy.
- Schedule logical exports before destructive migrations and test restoration at least quarterly.
- Keep migrations immutable after production application; add a new numbered migration for every change.
- Store backup access credentials in Vercel environment variables or an approved secrets manager, never in the repository.

## Operational notes

- Connection pooling is centralized in [lib/db.ts](../lib/db.ts), with a conservative default of five connections suitable for serverless runtimes.
- Route handlers that use `pg` declare `export const runtime = "nodejs"`. The Edge runtime cannot load the driver.
- The migration creates `pgcrypto` for UUID generation and `citext` for case-insensitive emails.
