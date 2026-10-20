# Verifiable.sg Security Remediation Plan

**Prepared:** 2026-10-20  
**Guiding constraint:** Remediate security boundaries without changing successful registration, login, password reset, certificate issuance, verification, viewing, OpenCerts, or TradeTrust behavior.

## Implementation status

Local code remediations for S-01 through S-11 are implemented. The project owner reports migration 011 is applied; no remote database was queried. Focused security/credential tests pass and both Vercel and GitHub Pages builds succeed. Full `node --test` discovery previously reported 106/108 passing; the remaining failures are the overview-card assertion and Node 26 ESM extensionless import in `scripts/test-opencerts.ts`. Production grants, Vercel/network behavior, and operational controls remain unverified; this is not a production security sign-off.

## Prioritization

| Order | Finding | Severity | Target |
|-------|---------|----------|--------|
| 1 | S-01: self-service role/organization mutation | HIGH | Immediate |
| 2 | S-02: DID-resolution SSRF | MEDIUM | Immediate |
| 3 | S-03: protocol-relative auth redirect | MEDIUM | Immediate |
| 4 | S-05: rate-limit RPC grants | MEDIUM, conditional | Immediate |
| 5 | S-04: organization metadata enumeration | LOW | Immediate |
| 6 | S-06: organization status authorization | MEDIUM | Immediate — fixed locally |
| 7 | S-07: issuer creation organization scope | MEDIUM | Immediate — fixed locally |
| 8 | S-08: organization creation authorization | MEDIUM | Immediate — fixed locally |
| 9 | S-09: public verification resource limits | MEDIUM | Immediate — fixed locally |
| 10 | S-10: baseline browser security headers | LOW | Short term — fixed locally |
| 11 | S-11: public-prefixed private key in static workflow | MEDIUM, conditional | Immediate — removed; verify/rotate secret |
| 12 | Backups, key management, CSP, and supply-chain hardening | Informational / operational | Short through long term |

## Immediate (0–7 days)

### 1. Close role and tenant self-escalation (S-01)

- **Implemented locally:** Migration 011 removes `users_self_update` and revokes broad user-table update grants. Issuer listing is tenant-scoped, and cross-organization listing/transfers require platform-admin authorization.
- **Pending verification:** Owner reports migration 011 applied. Check the effective hosted grants and whether any profile-editing feature depends on direct user-table updates.
- Remove the broad self-update policy for `users`.
- Permit only non-authoritative profile columns through column grants or a dedicated RPC.
- Ensure trusted role/membership administration is explicit, audited, and tenant-scoped.
- Correct issuer transfer authorization to validate the caller's current organization and target ownership inside the mutation path.
- Before deploying, inspect actual Supabase table grants and revoke any compensating broad grants that enable updates.
- Regression cases: ordinary users cannot mutate `roles`, `organization_id`, `issuer_id`, or authorization flags; admins cannot transfer issuers outside their authorized organization.

### 2. Harden public DID resolution against SSRF (S-02)

- **Implemented locally:** `/api/verify` injects a safe document loader with HTTPS-only fetches, DNS address validation/pinning, redirect revalidation, time/size limits, and DID document identity checks. Unit tests cover blocked addresses and safe resolution; the production build succeeds.
- **Pending before release:** Exercise valid public DIDs, existing certificates, OpenCerts/TradeTrust cases, and malicious/private targets in staging; confirm deployment DNS/egress behavior.
- Add a resolver wrapper that rejects loopback, private, link-local, multicast, reserved, and metadata-service IP ranges after DNS resolution.
- Revalidate all redirect targets and DNS resolutions; reject cross-protocol redirects.
- Bound network timeouts, redirects, and DID document response size.
- Add tests for IPv4/IPv6 private ranges, DNS rebinding behavior, redirects to private addresses, and valid public DID documents.
- Keep supported public `did:web` verification intact; do not require login for public verification.
- Add outbound network controls at the deployment boundary where possible.

### 3. Close auth redirect abuse (S-03)

- **Implemented locally:** Callback and login navigation now use shared internal-path validation; regression tests cover accepted and rejected destinations.
- Replace prefix-only path checks with same-origin URL validation and a route allowlist.
- Reject `//`, backslashes, encoded separators/control characters, and external URL forms.
- Test callback and login UI behavior for both accepted internal paths and hostile destinations.

### 4. Lock down rate-limit RPC execution (S-05)

- **Implemented locally:** Migration 011 revokes function execution from `PUBLIC`, `anon`, and `authenticated` and grants it to `service_role`; a migration regression test passes.
- **Pending verification:** Check the effective function grants/owner/search path, and confirm authentication rate limiting still works through the server role.
- Inspect the full SQL definition and production grants for `enforce_auth_rate_limit`.
- Revoke execute from `PUBLIC`, `anon`, and `authenticated`; grant only to the server-side database role needed by callers.
- Validate `SECURITY DEFINER` ownership and fixed `search_path`.
- Test that unauthorized roles cannot call the function and that normal login/reset flows continue to rate-limit.

### 5. Restrict organization enumeration (S-04)

- **Implemented locally:** Organization directory requires platform-admin; issuer listing is scoped to the caller's organization unless requested by platform-admin. Authorization tests pass.
- Require platform-admin authorization for cross-organization listing, or scope the API to the caller's organization.
- Add tests proving ordinary tenant users cannot enumerate organizations.

### 6. Restrict organization status changes (S-06)

- **Implemented locally:** Organization status PATCH requires `platform-admin` and validates the submitted status as `active` or `disabled`.
- **Verified:** Route tests cover denied callers, invalid statuses, and a successful admin update.
- **Pending before release:** Verify platform-admin assignment is controlled and test this path against staging authorization data.

### 7. Scope issuer creation to the caller's organization (S-07)

- **Implemented locally:** Issuer admins can create only within their session organization; specifying another organization returns 403. Platform-admins may explicitly create issuers in another organization.
- **Verified:** Route tests cover cross-tenant denial, own-tenant success, and platform-admin cross-tenant success.
- **Pending before release:** Confirm platform-admin issuer creation matches operational/admin UI expectations in staging.

### 8. Restrict organization creation (S-08)

- **Implemented locally:** Organization creation now requires `platform-admin`; ordinary authenticated users cannot invoke the service-role path that creates an organization and changes their organization association.
- **Verified:** Route test confirms the role gate stops the request before the service executes.

### 9. Bound public credential verification (S-09)

- **Implemented locally:** Verification is rate-limited to 30 requests per 15 minutes per client identity and reads request bodies through a 5 MiB streaming cap. Rate-limit responses are 429, oversized bodies are 413, and unexpected errors are generic to callers.
- **Verified:** Regression tests cover rate limiting, oversize rejection, and generic unexpected-error responses.
- **Pending before release:** Confirm the deployment proxy sanitizes/sets `x-forwarded-for`; otherwise per-IP limits can be evaded by spoofed forwarding values.

### 10. Add baseline HTTP security headers (S-10)

- **Implemented locally:** Next.js sets HSTS, `X-Content-Type-Options`, `Referrer-Policy`, and a restrictive `Permissions-Policy` on all routes. `X-Frame-Options: DENY` applies except to `/renderer/`, which must be embeddable by external credential viewers.
- **Verified:** Configuration regression test checks the shared headers and renderer-specific framing exception.
- **Pending before release:** Confirm headers are present on deployed pages, APIs, and rewritten DID routes; evaluate a CSP in report-only mode before enforcement.

### 11. Remove private-key-named public build variable (S-11)

- **Implemented locally:** Removed the `NEXT_PUBLIC_DID_PRIVATE_KEY_MULTIBASE` secret from the GitHub Pages build workflow. Public DID metadata is passed through workflow environment variables and written with `printf`, avoiding shell interpolation.
- **Verified:** Regression test asserts that no public-prefixed private key variable or server-private key secret is injected into the static workflow.
- **Pending outside this repository:** Determine whether the prior GitHub secret contained an actual private key. If it did, rotate the signing key and inspect historical published build artifacts and logs.

### Release safety checks

- Migration 011 is reported applied by the project owner; verify the hosted grants and test signup, login, password reset, issuance, verification, revocation, and template administration in staging.
- Verify migrations are additive or have a safe rollback strategy; do not perform production migrations without the deployment owner’s approval.
- Confirm errors do not disclose secrets, SQL details, or internal DID documents.

## Short Term (within 30 days)

### Identity and key management

- Establish separate signing keys per issuer profile and distinct transaction keys for Document Store operations.
- Use Vercel encrypted environment secrets or an approved cloud secret manager; restrict production read access and audit secret access.
- Remove any private-key-like value from `NEXT_PUBLIC_*` deployment variables. Inspect deployment workflows, build logs, source maps, and generated assets for exposure.
- Define rotation: create a new key and verification method, publish new DID material without deleting historical public keys, issue new credentials with the new key, and retain old verification material for the credential retention period.
- Avoid in-place replacement of secret contents behind an existing key reference.

### API abuse controls

- Verify proxy/header trust for rate limits; only trust IP metadata inserted by the controlled ingress.
- Add rate limits to public verification and other expensive unauthenticated operations, using stable server-derived client identity and abuse monitoring.
- Apply request body size limits and JSON parsing limits for credential verification and file uploads.
- Review account enumeration behavior in signup and password reset; preserve generic user-facing responses.

### HTTP/browser protections

- Verify HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`, and `Permissions-Policy` on the deployment.
- Introduce CSP in report-only mode, collect violations, then enforce a policy compatible with Next.js, Supabase Auth, Resend links, DID resolution, and supported credential viewers.
- Keep narrowly scoped CORS for public DID and status resources; do not broaden authenticated APIs.

### Observability

- Ensure logs do not include private keys, reset tokens, full credentials, recipient PII, or authentication cookies.
- Add security audit events for role changes, organization membership changes, issuer transfers, key reference changes, and sensitive credential revocation.
- Alert on repeated failed authentication, verification SSRF rejections, rate-limit RPC anomalies, and Document Store failures.

## Medium Term (within 90 days)

### Supabase and database assurance

- Generate an inventory of all tables, views, RPCs, grants, RLS policies, owners, and `SECURITY DEFINER` functions from the deployed project.
- Require RLS on tenant-sensitive tables and test policies with anon, authenticated, service-role, and cross-tenant identities.
- Review every `SECURITY DEFINER` function for fixed `search_path`, minimum grants, tenant checks, input bounds, and race-safe behavior.
- Add CI checks or migration tests that fail when new sensitive tables lack RLS or new RPCs remain executable by `PUBLIC`.
- Verify service-role keys are server-only and never bundled in client code or exposed through error responses.

### Credential and blockchain lifecycle

- Validate issuance-time snapshots against the signed credential and persisted issuer profile.
- Test cross-profile and legacy revocation, status-list freshness, key-rotation verification, malformed proofs, and duplicate registration.
- Add retryable Document Store registration state with idempotency and operational reconciliation; avoid reporting a credential fully anchored when registration is pending or failed.
- Document contract addresses, chain IDs, RPC trust assumptions, transaction-key permissions, and emergency pause/response procedures.
- Add chain/provider timeouts, retry/backoff policy, and monitoring for dropped or reverted transactions.

### Dependency and build supply chain

- Run automated dependency scanning for production dependencies and lockfile changes.
- Pin GitHub Actions to immutable commit SHAs; maintain a scheduled update process.
- Generate and retain a software bill of materials for production releases.
- Protect deployment branches and require review for auth, migration, secret, and workflow changes.

## Long Term (180+ days)

### Backup and disaster recovery

- Confirm Supabase backup retention and Point-in-Time Recovery configuration against business recovery objectives.
- Maintain encrypted, access-controlled backups of database and operational configuration. Keep signing-key recovery separate and more restricted.
- Test restore procedures at least quarterly in a non-production environment and document RPO/RTO.
- Define recovery and compromise procedures for issuer keys, Document Store transaction keys, Supabase service-role keys, and Vercel deployment credentials.

### Assurance program

- Schedule periodic independent penetration tests focusing on tenant isolation, public verification SSRF, credential integrity, auth recovery, and smart-contract interactions.
- Conduct tabletop exercises for issuer-key compromise, tenant data exposure, database restoration, and blockchain transaction failure.
- Reassess OpenCerts/TradeTrust compatibility after security changes using representative legacy credentials and external verification tools.

## Files requiring changes or operational review

### Likely code and migration changes

- `database/migrations/003_supabase_auth.sql` — replace broad user self-update authorization.
- `database/migrations/004_supabase_api_only.sql` — restrict rate-limit RPC execution.
- `app/api/issuers/handler.ts` and `services/IssuerService.ts` — enforce organization ownership on transfer.
- `app/api/verify/route.ts` and `lib/trustvc.ts` — SSRF-safe DID resolution.
- `app/auth/callback/route.ts` and `app/issuer/page.tsx` — same-origin redirect validation.
- `app/api/organizations/handler.ts` and `services/OrganizationService.ts` — organization listing authorization/scope.
- Add focused tests alongside the affected migrations, routes, and services.

### Deployment and operational review

- Supabase: verify migration 011 grants, RLS inventory, MFA settings, password policies, audit logging, backup/PITR, and restore access.
- Vercel: environment-variable scope, private key removal from public-prefixed variables, edge headers, build logs/artifacts, deployment access.
- GitHub Pages: determine whether the removed workflow secret was a real key and whether previous build artifacts contained it; rotate/revoke if exposure is possible.
- Network: outbound egress restrictions, DNS behavior, proxy forwarding-header sanitization.
- Ethereum / Document Store: contract addresses, chain IDs, signer permissions, RPC provider configuration, transaction monitoring.
- Resend: API key scope, verified domains, sender alignment, suppression and abuse controls.
- GitHub Actions: pin action references to SHAs and inspect secret exposure in workflow logs.

## Verification gates

Security remediation is complete only after:

1. Cross-tenant access tests pass for issuer, organization, template, credential, and revocation resources.
2. Direct Supabase calls cannot mutate role or tenant authority fields.
3. Public verification rejects private-network DID targets without disrupting valid public DID verification.
4. Auth callback and login UI reject external/protocol-relative destinations.
5. Unauthorized database roles cannot invoke sensitive security-definer RPCs.
6. Signup, login, password reset, certificate issuance, verification, viewing, OpenCerts, and TradeTrust regression tests pass.
7. Staging restore and key-rotation exercises are completed and documented.
