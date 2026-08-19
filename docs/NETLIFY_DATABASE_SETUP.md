# Netlify Database Setup

## 1. Provision the database

1. In the Netlify site dashboard, create or connect a Netlify Database for `verifiable.netlify.app`.
2. Copy the PostgreSQL connection URL supplied by Netlify.
3. Add `DATABASE_URL` in **Site configuration → Environment variables** for production, deploy previews, and local development where appropriate.

## 2. Configure environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes for database APIs | PostgreSQL connection URL provided by Netlify. |
| `DATABASE_POOL_MAX` | No | Maximum pooled connections. Default: `5`. |
| `AGENT_PROVIDER` | No | `openai`, `azure-openai`, `copilot-studio`, or omit for local assistant. |
| `OPENAI_API_KEY` | Provider dependent | Server-only OpenAI-compatible key. |
| `AZURE_OPENAI_API_KEY` | Provider dependent | Azure key; wire a dedicated Azure adapter before enabling. |
| `AGENT_MODEL` | No | LLM model name. Default: `gpt-4o-mini`. |
| `PASSWORD_RESET_WEBHOOK_URL` | Recommended | Server-side email delivery webhook for issuer password reset links. |
| `PASSWORD_RESET_BASE_URL` | Recommended | Public URL used to construct reset links, for example `https://verifiable.netlify.app`. |
| `PASSWORD_RESET_WEBHOOK_SECRET` | Optional | Bearer token sent to the reset webhook for authenticating delivery requests. |

The webhook receives a JSON `POST` body:

```json
{
	"event": "issuer.password_reset_requested",
	"email": "issuer@example.com",
	"resetUrl": "https://verifiable.netlify.app/issuer?mode=reset&token=...",
	"expiresInMinutes": 30,
	"requestedAt": "2026-08-17T12:00:00.000Z"
}
```

It must return a `2xx` response. The request includes `Authorization: Bearer <PASSWORD_RESET_WEBHOOK_SECRET>` when the secret is configured. Delivery has an eight-second timeout; a failed delivery returns an error rather than claiming that the email was sent.

Do not use this project&apos;s own `/.netlify/functions/password-reset` URL as the webhook URL. That endpoint processes reset requests; it does not send email and would recursively call itself. Configure an external email webhook instead.

Never use `NEXT_PUBLIC_` for database URLs or AI provider keys.

Issuer registration and login require the Netlify server runtime and database migration `002_issuer_auth.sql`. Password reset requests are generic to prevent account enumeration. In production, configure `PASSWORD_RESET_WEBHOOK_URL` to deliver the generated reset link through an approved email provider; reset tokens are never returned to the browser in production. In local development, the API returns a development token to make the flow testable without an email provider.

## 3. Run migrations

Use a privileged PostgreSQL connection in CI, Netlify Build Plugin, or an operator shell:

```sh
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
```

Record applied migrations in your deployment pipeline. Do not run unreviewed migrations automatically against production.

## 4. Local development

1. Copy the Netlify database URL into a local `.env.local` file:

```sh
DATABASE_URL=postgresql://...
DATABASE_POOL_MAX=5
```

2. Apply the migration to a local or isolated development database.
3. Run `npm run dev`.
4. Test `GET /api/issuers`, `GET /api/templates`, `GET /api/credentials`, and `POST /api/agent/session`.

The UI retains browser-only fallback behavior when server APIs are unavailable. Database features require the server-capable Netlify runtime; static GitHub Pages cannot serve these API routes.

For a new database, apply both migrations in order:

```sh
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f database/migrations/002_issuer_auth.sql
```

## 5. Backup and recovery

- Enable Netlify/database-provider automated backups and verify retention meets organizational policy.
- Schedule logical exports before destructive migrations and test restoration at least quarterly.
- Keep migrations immutable after production application; add a new numbered migration for every change.
- Store backup access credentials in Netlify environment controls or an approved secrets manager, never in the repository.

## Operational notes

- Connection pooling is centralized in [lib/db.ts](../lib/db.ts), with a conservative default of five connections suitable for serverless runtimes.
- The migration creates `pgcrypto` for UUID generation and `citext` for case-insensitive emails.
- Add authenticated organization/issuer scopes before allowing external API callers in production.