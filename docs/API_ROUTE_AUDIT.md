# API routes, request budgets and Vercel eligibility

## Current CaaS website audit — 2026-11-05

### Eligibility and limits

**This is a commercial CaaS platform. Vercel Hobby is restricted to personal,
non-commercial use, so this application is not eligible regardless of traffic.**
No hosting plan, paid subscription or deployment has been changed. Account Usage
figures were unavailable; monthly quota compliance cannot be certified from code.

The current [Hobby documentation](https://vercel.com/docs/plans/hobby) lists these
included allowances:

| Meter | Included allowance |
| --- | ---: |
| Function invocations | 1,000,000 |
| Active CPU | 4 CPU-hours |
| Provisioned memory | 360 GB-hours |
| CDN requests | 1,000,000 |
| Fast data transfer | 100 GB |
| Fast origin transfer | 10 GB |

These are separate meters, not interchangeable request budgets. Check the
current documentation and the project's plan before deployment. Function
configuration also has separate [runtime limits](https://vercel.com/docs/functions/limitations).
The older “12 functions” target below is historical; route source counts do not
establish today's plan eligibility or final deployed function count.

### Verified build inventory

`npm run build` and `.next/server/app-paths-manifest.json` report:

- **8 API route entry points**, unchanged by the website redesign.
- **10 route handlers**, including the two auth callbacks.
- **27 page candidates**, including the generated not-found page.
- **Dynamic server rendering for pages**, plus the proxy. The root layout reads
  the authenticated session; the previous claim that all pages are static no
  longer applies. Page loads, RSC navigations/prefetches and protected redirects
  can therefore consume function work in addition to explicit API calls.

Vercel may bundle these differently. Only a deployed Build Output/function
inventory and the account Usage dashboard can establish actual consumption.
Consolidating handlers reduces entry points, not the number of invocations.

### Request reductions

The server already resolves the session for the layout. A shared client session
now reuses that result instead of making independent header, footer and page
authentication requests. Authorization is still checked by every protected API;
client navigation visibility is not an authorization boundary.

| Browser workflow | Previous application API reads | Current application API reads |
| --- | ---: | ---: |
| Header and footer on initial page/navigation | 2 auth reads | **0** |
| Credential overview, including shared shell | 3 auth + 1 credentials | **1 credentials** |
| Issuer administration, including shared shell | 3 auth + 1 organizations + 1 issuers | **2 directory reads** |
| Single/batch template catalog on issuance page | 2 template reads | **1 shared template read** |
| Assistant session while closed | Session creation on first visit | **0** |

- Sign-in and sign-out explicitly refresh the shared session once. Concurrent
  refreshes and auth-change listeners share one in-flight request.
- Signed-in workspace access reuses the overview instead of a second dashboard.
  Recovery/invitation links are processed before displaying the overview.
- Assistant sessions are created on explicit opening, coalesced while in flight,
  and reused across navigation. Session failures are shown in the conversation.
- Header, sidebar, footer and shared consent/legal links disable automatic
  prefetch. Other page links can still prefetch; this is not a claim that the
  entire application has zero RSC prefetch traffic.
- API paths no longer take a trailing-slash redirect hop through the proxy.
  Existing slash/no-slash API URLs still resolve, and protected paths still
  authenticate before dispatch. Ordinary page canonical redirects are unchanged.
- Directory filters, credential search/sort and overview summary counts are
  local operations. The summary describes loaded records, not lifetime totals.
- There is no periodic application polling. Issuance, verification, delivery,
  revocation, profile updates and audit-range changes retain their required
  action-triggered requests. Batch issuance still makes a request per credential.

These counts exclude page rendering/proxy work, static assets, Supabase's own
authentication traffic, RPC providers, and optional consented analytics.
Public verification and externally requested credentials can generate additional
traffic independently of a signed-in workspace session.

### Validation and deployment gate

Regression tests cover zero session calls on mount/rerender, concurrent refresh
coalescing, visible failures, stale-response rejection, role-aware navigation,
directory request counts, and single/batch template sharing. Responsive browser
checks use synthetic/anonymous state, not production credentials.

Recorded results:

- Production build, TypeScript and `git diff --check`: pass.
- Focused UI, request-budget, recovery, preview, theme and proxy tests: **91/91**.
- Full `node --test` suite: **348 tests, 333 passed, 15 failed**. Every remaining
  failure name also appears in the recorded pre-redesign baseline (335 tests,
  315 passed, 20 failed). The full suite is not green; existing signing/config
  and isolated-loader failures remain release blockers.
- Twelve public pages at 320, 375, 768 and 1280 pixels: no document-level
  horizontal overflow and no passive application API calls. Initially unlabelled
  JSON/CSV editors were corrected and rechecked.
- Synthetic workspace layout at the same four widths, light/dark: mobile record
  cards, desktop sidebar, and no document-level horizontal overflow.
- Hydrated mobile navigation with four mocked roles: expected permission-gated
  links and exactly four session requests for four explicit auth-change events.
  This tests UI behavior, not a bypass of server authorization.
- Local production HTTP: anonymous session 200, protected directory/credentials
  401, all without redirect hops. These checks use a synthetic Supabase origin.
  Public verification returns 500 in that isolated setup because its required
  rate-limit database is unavailable; real cryptographic verification is not
  claimed from this environment. A mocked verification response exercises only
  preview rendering and keyboard behavior.

Before asserting a hosting budget:

1. Select hosting terms that permit commercial use; obtain approval before spend.
2. Record Vercel Usage for invocations, CPU, memory, CDN and both transfer meters.
3. Measure a representative period including public verification, certificate
   downloads, batch issuance and dynamic navigation. Extrapolate each meter
   separately for the billing cycle with headroom.
4. Configure the available account usage controls/notifications and verify the
   deployed function inventory. Application rate limits are not a monthly
   account-wide invocation or spending cap.

No actual monthly usage, live authenticated issuance, production migration or
commercial Hobby compliance is claimed.

## Historical route-consolidation audit

Date: 2026-10-14

## Result

| Inventory | Before | After |
| --- | ---: | ---: |
| API `route.ts` entry points | 22 | **8** |
| All App Router dynamic route handlers, including auth callbacks | 24 | **10** |
| Unchanged proxy/middleware | 1 | 1 |
| Conservative total if the proxy consumes a separate function | 25 | **11** |

The production Next build and `.next/server/app-paths-manifest.json` confirm
the historical after counts. At that time the pages were static; the current
authenticated layout makes pages dynamic, as documented above. Ten handlers, or
eleven including the proxy, met the historical requested 12-handler target, not
a verified Vercel deployment or invocation budget. These are not counts from
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
