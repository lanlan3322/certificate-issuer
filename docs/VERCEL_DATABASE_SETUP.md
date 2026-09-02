# Vercel Database Setup

## 1. Provision the database

1. Create a Supabase project.
2. Copy the project URL, publishable/anon key, and server-only service-role key.
3. Add them in Vercel **Project Settings → Environment Variables** for Production, Preview, and Development.

## 2. Configure environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser-safe key used for issuer sessions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only key used for registration and rate limiting. |
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

Use the Supabase SQL Editor or Supabase CLI to apply each migration in numeric order. Vercel builds run in an ephemeral sandbox and should not apply migrations.

Record applied migrations in your deployment pipeline. Do not run unreviewed migrations automatically against production.

## 4. Local development

1. Pull the project environment into a local `.env.local` file:

```sh
npx vercel env pull .env.local
```

Or set it manually:

```sh
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

2. Apply the migration to a local or isolated development database.
3. Run `npm run dev`.
4. Test `GET /api/issuers`, `GET /api/templates`, `GET /api/credentials`, and `POST /api/agent/session`.

The UI retains browser-only fallback behavior when server APIs are unavailable. Database features require the server-capable Vercel runtime; static GitHub Pages cannot serve these API routes.

For a new Supabase project, apply all migrations in order:

```sh
database/migrations/001_initial_schema.sql
database/migrations/002_issuer_auth.sql
database/migrations/003_supabase_auth.sql
database/migrations/004_supabase_api_only.sql
```

## 5. Backup and recovery

- Enable your database provider&apos;s automated backups and verify retention meets organizational policy.
- Schedule logical exports before destructive migrations and test restoration at least quarterly.
- Keep migrations immutable after production application; add a new numbered migration for every change.
- Store backup access credentials in Vercel environment variables or an approved secrets manager, never in the repository.

## Operational notes

- Server routes access data through the Supabase APIs; no direct PostgreSQL connection is required.
- The migration creates `pgcrypto` for UUID generation and `citext` for case-insensitive emails.
