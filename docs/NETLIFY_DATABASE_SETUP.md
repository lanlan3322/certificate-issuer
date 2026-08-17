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

Never use `NEXT_PUBLIC_` for database URLs or AI provider keys.

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

The UI retains browser-only fallback behavior when server APIs are unavailable. Database features require a server-capable Netlify runtime; static GitHub Pages cannot serve the API routes.

## 5. Backup and recovery

- Enable Netlify/database-provider automated backups and verify retention meets organizational policy.
- Schedule logical exports before destructive migrations and test restoration at least quarterly.
- Keep migrations immutable after production application; add a new numbered migration for every change.
- Store backup access credentials in Netlify environment controls or an approved secrets manager, never in the repository.

## Operational notes

- Connection pooling is centralized in [lib/db.ts](../lib/db.ts), with a conservative default of five connections suitable for serverless runtimes.
- The migration creates `pgcrypto` for UUID generation and `citext` for case-insensitive emails.
- Add authenticated organization/issuer scopes before allowing external API callers in production.