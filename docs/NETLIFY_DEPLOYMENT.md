# Netlify Server Deployment

## Architecture

The Netlify deployment runs the Next.js application with its server runtime enabled. This is required for:

- PostgreSQL access through `DATABASE_URL`
- issuer cookie sessions and password reset
- Next.js API routes
- the Netlify Function adapters in `netlify/functions`
- optional hosted AI providers

GitHub Pages is no longer a supported production target for this server-capable configuration because it cannot execute database or authentication APIs. Use Netlify for the application deployment.

## Build settings

The repository includes [netlify.toml](../netlify.toml):

```toml
[build]
  command = "npm run build:netlify"
  publish = ".next"
  functions = "netlify/functions"
```

Netlify should use Node.js 20. Do not set `output: "export"`; `next.config.js` intentionally keeps the Next.js server runtime enabled.

## Required environment variables

```env
DATABASE_URL=postgresql://...
PASSWORD_RESET_BASE_URL=https://verifiable.netlify.app
PASSWORD_RESET_WEBHOOK_URL=https://your-email-service.example/password-reset
```

Optional:

```env
DATABASE_POOL_MAX=5
PASSWORD_RESET_WEBHOOK_SECRET=...
AGENT_PROVIDER=openai
OPENAI_API_KEY=...
AGENT_MODEL=gpt-4o-mini
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=your-deployment
AZURE_OPENAI_API_VERSION=2024-10-21
```

Never prefix database, provider, password-reset, or webhook secrets with `NEXT_PUBLIC_`.

## Deployment procedure

1. Connect the GitHub repository to Netlify.
2. Set the production environment variables in the Netlify site settings.
3. Apply the database migrations in order:

```sh
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f database/migrations/002_issuer_auth.sql
```

4. Deploy the site with the Netlify build command.
5. Verify:

```sh
curl -i https://verifiable.netlify.app/api/health/db
curl -i https://verifiable.netlify.app/.netlify/functions/db-health
```

6. Register a test issuer, log in, create a reset request, and verify that the configured webhook receives the reset event.

## Function endpoints

| Function | URL | Method |
| --- | --- | --- |
| Database health | `/.netlify/functions/db-health` | GET |
| Issue persistence | `/.netlify/functions/issue-certificate` | POST |
| Credential lookup/logging | `/.netlify/functions/verify-certificate` | POST |
| Revocation persistence | `/.netlify/functions/revoke-certificate` | POST |
| Password reset | `/.netlify/functions/password-reset` | POST |
| AI agent | `/.netlify/functions/agent` | POST |
| Agent analytics | `/.netlify/functions/agent-analytics` | POST |

The Next.js API routes remain the primary browser-facing API surface. Functions are deployment adapters for integrations, scheduled jobs, and external callers.

## Troubleshooting

- `503 Database unavailable`: check `DATABASE_URL`, migration state, SSL requirements, and connection limits.
- Auth route fails during static export: use the Netlify build, not `build:github-pages`.
- Reset email not delivered: check webhook URL, bearer secret, webhook response status, and Netlify function logs.
- Do not set `PASSWORD_RESET_WEBHOOK_URL` to `/.netlify/functions/password-reset`; that function creates reset tokens and is not an email sender. Use an external email webhook or an email provider endpoint.
- AI falls back to local responses: check `AGENT_PROVIDER` and server-only provider credentials.
- Function cannot import a module: confirm the dependency is in `dependencies`, not only `devDependencies`.