# Vercel Server Deployment

## Architecture

The Vercel deployment runs the Next.js application with its server runtime enabled. This is required for:

- Supabase Auth and database APIs
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

## Required environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional:

```env
PASSWORD_RESET_BASE_URL=https://your-project.vercel.app
AGENT_PROVIDER=openai
OPENAI_API_KEY=...
AGENT_MODEL=gpt-4o-mini
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=your-deployment
AZURE_OPENAI_API_VERSION=2024-10-21
```

Never prefix database, provider, password-reset, or Supabase service-role secrets with `NEXT_PUBLIC_`. Anything prefixed `NEXT_PUBLIC_` is inlined into the browser bundle.

Set each variable for the Production, Preview, and Development environments separately in **Project Settings → Environment Variables**. Preview deployments should point at a non-production database.

## Deployment procedure

1. Import the GitHub repository into Vercel.
2. Set the production environment variables in the Vercel project settings.
3. Apply the Supabase SQL migrations in order using the Supabase SQL Editor or CLI:

```sh
database/migrations/001_initial_schema.sql
database/migrations/002_issuer_auth.sql
database/migrations/003_supabase_auth.sql
database/migrations/004_supabase_api_only.sql
database/migrations/005_remove_self_registration.sql
```

4. Trigger a deployment (push to the production branch, or `vercel --prod`).
5. Verify:

```sh
curl -i https://your-project.vercel.app/api/health/supabase
```

6. Register a test issuer, log in, create a reset request, and verify that Supabase Auth sends the reset email.

## API endpoints

All server logic is served by Next.js App Router route handlers under `app/api`. There is no separate function directory.

| Purpose | Route | Method | Auth |
| --- | --- | --- | --- |
| Supabase health | `/api/health/db` | GET | public |
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

- `503 Supabase unavailable`: check the Supabase URL, service-role key, and migration state.
- Auth route fails during static export: use the Vercel build, not `build:github-pages`.
- Reset email not delivered: check Supabase Auth email settings and allowlist `https://www.verifiable.sg/auth/recovery`.
- Reset link reports an unsupported PKCE code: update the Supabase password recovery email template to link to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery` instead of using the default confirmation URL.
- AI falls back to local responses: check `AGENT_PROVIDER` and server-only provider credentials.
