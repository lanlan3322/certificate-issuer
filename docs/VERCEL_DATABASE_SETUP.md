# Vercel Database Setup

## 1. Provision the database

1. Create a Supabase project.
2. Copy the project URL, publishable/anon key, and server-only service-role key.
3. Add them in Vercel **Project Settings -> Environment Variables** for Production, Preview, and Development.

## 2. Configure environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser-safe key used for issuer sessions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only key used for rate limiting. |
| `PASSWORD_RESET_BASE_URL` | Optional | Overrides the public URL inferred from the reset request when constructing the Supabase Auth redirect URL. |
| `AGENT_PROVIDER` | No | `openai`, `azure-openai`, `copilot-studio`, or omit for local assistant. |
| `OPENAI_API_KEY` | Provider dependent | Server-only OpenAI-compatible key. |
| `AZURE_OPENAI_API_KEY` | Provider dependent | Azure key; wire a dedicated Azure adapter before enabling. |
| `AGENT_MODEL` | No | LLM model name. Default: `gpt-4o-mini`. |

Never use `NEXT_PUBLIC_` for database URLs, Supabase service-role keys, or AI provider keys; those values are inlined into the browser bundle.

Issuer login requires the Vercel server runtime and database migration `002_issuer_auth.sql`. Password reset requests use Supabase Auth's built-in email delivery via `resetPasswordForEmail` and redirect users back through `/auth/recovery`. For production, set `PASSWORD_RESET_BASE_URL=https://www.verifiable.sg` or ensure reset requests originate from that host, and add `https://www.verifiable.sg/auth/recovery` to the Supabase Auth redirect URL allowlist. Password reset responses remain generic to prevent account enumeration.

Configure the Supabase password recovery email template to use a token hash link instead of the default PKCE confirmation URL:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

The dedicated recovery callback verifies this link with `verifyOtp({ token_hash, type: "recovery" })`. It intentionally does not call `exchangeCodeForSession()` for password resets because PKCE auth-code links require browser-local code verifier storage and fail when the email is opened without that verifier.

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
PASSWORD_RESET_BASE_URL=http://localhost:3000
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
database/migrations/005_remove_self_registration.sql
```

## 5. Backup and recovery

- Enable your database provider's automated backups and verify retention meets organizational policy.
- Schedule logical exports before destructive migrations and test restoration at least quarterly.
- Keep migrations immutable after production application; add a new numbered migration for every change.
- Store backup access credentials in Vercel environment variables or an approved secrets manager, never in the repository.

## Operational notes

- Server routes access data through the Supabase APIs; no direct PostgreSQL connection is required.
- The migration creates `pgcrypto` for UUID generation and `citext` for case-insensitive emails.
