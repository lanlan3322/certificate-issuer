# API route and Hobby function-budget audit

Date: 2026-10-14

## Result

| Inventory | Before | After |
| --- | ---: | ---: |
| API `route.ts` entry points | 22 | **8** |
| All App Router dynamic route handlers, including auth callbacks | 24 | **10** |
| Unchanged proxy/middleware | 1 | 1 |
| Conservative total if the proxy consumes a separate function | 25 | **11** |

The production Next build and `.next/server/app-paths-manifest.json` confirm
the after counts. All pages in this build are static. Ten dynamic handlers, or
eleven including the proxy conservatively, are below the requested 12-function
limit. These are build-derived deployment candidates, not a count obtained from
a deployed Vercel Build Output directory; Vercel can group functions differently.
The final hosted deployment and its function inventory still need confirmation.

No dependencies, database migrations, credential fields, contracts, signing
settings or production services were changed by this route consolidation.

## Complete original API inventory

HEAD is implicit where GET exists; OPTIONS is implicit.

| Original URL | Methods | Action |
| --- | --- | --- |
| `/api/.well-known/did` | GET | Retained separately |
| `/api/.well-known/jwks` | GET | Retained separately |
| `/api/agent` | POST | Agent router |
| `/api/agent/session` | GET, POST, DELETE | Agent router |
| `/api/agent/analytics` | GET, POST | Agent router |
| `/api/audit` | GET | Business router |
| `/api/auth/login` | POST | Authentication router |
| `/api/auth/logout` | POST | Authentication router |
| `/api/auth/me` | POST | Authentication router |
| `/api/auth/reset` | POST | Authentication router |
| `/api/auth/reset-request` | POST | Authentication router |
| `/api/credentials` | GET, POST, PATCH | Business router |
| `/api/debug-trustvc` | GET | Removed unused SDK-export diagnostic |
| `/api/health/db` | GET | Removed unused database diagnostic |
| `/api/health/supabase` | GET | Removed unused database diagnostic |
| `/api/issue` | POST | Retained separately |
| `/api/issuers` | GET, POST, PATCH | Business router |
| `/api/platform/stats` | GET | Business router; remains public |
| `/api/revocation` | GET, POST | Business router |
| `/api/status-list/[page]/[purpose]` | GET | Retained separately |
| `/api/templates` | GET, POST, DELETE | Business router |
| `/api/verify` | POST | Retained separately |

No `test-*`, compatibility-check or migration-diagnostic API entry points were
found. The three removed diagnostics have no callers in application code,
scripts or repository workflows. External monitoring clients cannot be
discovered from this repository; they must stop calling those removed endpoints.
Signed status-list publication is a production feature, not a diagnostic.

## Files removed

Only these implementations were discarded:

- `app/api/debug-trustvc/route.ts`
- `app/api/health/db/route.ts`
- `app/api/health/supabase/route.ts`

They now return 404 through the exact-match business router. Removed the obsolete
debug-route runtime-tracing entry from `next.config.js`.

## Files consolidated

The following 14 `route.ts` files were renamed to `handler.ts` in their original
directories. Their content is byte-for-byte identical to the pre-change version.
Renaming, rather than importing from an existing `route.ts`, prevents Next from
continuing to create a separate function for each old entry point.

| Original `route.ts` directory | New entry point |
| --- | --- |
| `app/api/auth/login/` | `app/api/auth/[action]/route.ts` |
| `app/api/auth/logout/` | `app/api/auth/[action]/route.ts` |
| `app/api/auth/me/` | `app/api/auth/[action]/route.ts` |
| `app/api/auth/reset/` | `app/api/auth/[action]/route.ts` |
| `app/api/auth/reset-request/` | `app/api/auth/[action]/route.ts` |
| `app/api/agent/` | `app/api/agent/[[...action]]/route.ts` |
| `app/api/agent/session/` | `app/api/agent/[[...action]]/route.ts` |
| `app/api/agent/analytics/` | `app/api/agent/[[...action]]/route.ts` |
| `app/api/credentials/` | `app/api/[...resource]/route.ts` |
| `app/api/issuers/` | `app/api/[...resource]/route.ts` |
| `app/api/templates/` | `app/api/[...resource]/route.ts` |
| `app/api/audit/` | `app/api/[...resource]/route.ts` |
| `app/api/revocation/` | `app/api/[...resource]/route.ts` |
| `app/api/platform/stats/` | `app/api/[...resource]/route.ts` |

`lib/api-router.ts` handles exact path/method dispatch. It forwards the original
Request and Response without reading/rebuilding cookies, query strings or bodies.
Unknown paths return 404; unsupported methods return 405 with Allow; OPTIONS
returns the endpoint-specific Allow list; HEAD uses GET with a bodyless response.
Existing proxy rules still run first, including their 401 responses.
No rewrites or frontend URL changes are needed.

## Eight retained API entry points

1. `app/api/.well-known/did/route.ts`
2. `app/api/.well-known/jwks/route.ts`
3. `app/api/[...resource]/route.ts`
4. `app/api/agent/[[...action]]/route.ts`
5. `app/api/auth/[action]/route.ts`
6. `app/api/issue/route.ts`
7. `app/api/status-list/[page]/[purpose]/route.ts`
8. `app/api/verify/route.ts`

`app/auth/callback/route.ts` and `app/auth/recovery/route.ts` remain unchanged.
The legacy public DID document remains static. Non-legacy `did:web` hostnames
are rewritten to the public DID API, which resolves issuer-profile DID
documents by host. The public JWKS path remains unchanged.
Issue/verify endpoints, certificate viewing pages/templates and the signed
status-list handler remain separate and unchanged. Login/reset handlers retain
their rate limits, audit logging, session handling and reset-link origin logic.
Issuer-admin authorization and tenant scoping remain in the existing handlers.

There was no registration API entry point in the audited baseline; this change
does not add, remove or re-enable self-registration. Existing issuer provisioning,
Supabase auth callbacks and application registration policy are untouched.

## Validation

- **37 tests PASS** using the existing Node runner: new routing/method/cookie/
  authorization/budget tests plus existing issue, verify, rendering, legacy
  wallet, DID publication, signing and PostgreSQL regressions.
- **Production build and TypeScript PASS.** The first build encountered stale
  `.next/dev/types` references to renamed files. Regenerated those development
  types with Next, then rebuilt successfully; no TypeScript checks were disabled.
- Build manifest: **8 API handlers, 10 App Router route handlers**. No old
  diagnostic or pre-consolidation route entries remain.
- Local production-server HTTP checks with a synthetic Supabase origin/key:
  removed diagnostics/unknown paths 404; auth method negotiation 204/405;
  missing login/reset payloads 400; unauthenticated session `{user:null}`;
  protected credentials/templates/issuance/analytics 401; empty verify payload
  400; invalid agent session query 400; callback/recovery redirects 307; issuer
  and verify pages 200; public static DID/JWKS 200.
- The local dynamic DID/JWKS APIs return 503 because the previously documented
  local signing/publication configuration is invalid; the disabled status-list
  service also returns 503. These unchanged configuration gates are not reported
  as successful publication.
- The initial unconfigured development-server smoke attempt was blocked by
  missing local Supabase client settings. The subsequent production-server route
  checks used synthetic process-only settings, not production credentials. Test
  servers were stopped; no production users, emails or database rows were used.

No live login, registration, password-email delivery, authenticated issuance or
external verifier acceptance is claimed from these isolated tests. No commit,
push or deployment was performed as part of this audit.

## Next action

Review/approve committing and pushing this consolidation, then confirm Vercel's
final function inventory and deployment success. Run authorized production
login/reset, issuance/verification/view and legacy smoke checks. The earlier
status-profile migration/signing activation gates remain separate.
