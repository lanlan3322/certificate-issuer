# Verifiable.sg Security Audit

**Review date:** 2026-10-20  
**Scope:** Read-only repository review of application code, migrations, deployment configuration, dependency manifests, and existing security controls. No production services, Supabase grants, Vercel settings, or secrets were accessed.

**Follow-up remediation status:** Application changes for S-01 through S-04 and S-06 through S-11, and migration 011 for S-01/S-05, have been implemented and locally tested. The project owner reports migration 011 is applied; this was not independently verified against a remote database. Hosted grants, deployment configuration, and operational controls remain unverified. See the remediation plan for release gates.

## Executive summary

The initial review identified tenant authorization boundaries, attacker-directed DID resolution, unsafe authentication redirects, cross-tenant organization metadata listing, and a potentially over-permissive rate-limit RPC. Follow-up reviews found additional gaps in organization status changes, issuer creation, and organization creation authorization. Local changes now protect those operations, rate-limit and bound public verification requests, avoid returning internal verification errors, and add baseline browser security headers.

The owner reports database migration 011 has been applied. Its hosted state and effective grants were not queried, so S-01 and S-05 should be considered deployment-confirmed only after independently checking the database. Production secrets, network egress, Vercel edge configuration, and Supabase backup settings were not accessed and cannot be asserted secure.

No source-level private key literal or concrete vulnerable dependency was established during this review. Production secrets, hosted grants, network egress, Vercel edge configuration, and Supabase backup settings are not observable from repository evidence.

## Risk register

| ID | Severity | Finding | Confidence | Current status |
|----|----------|---------|------------|----------------|
| S-01 | HIGH | Self-service user updates may change roles and organization membership | 8/10 | Mitigation deployed per owner; grants not independently verified |
| S-02 | MEDIUM | Public credential verification can trigger DID-resolution SSRF | 9/10 | Safe loader implemented and tested; live network/deployment validation pending |
| S-03 | MEDIUM | Authentication redirects accept protocol-relative external destinations | 9/10 | Fixed and regression-tested |
| S-04 | LOW | Authenticated users can enumerate organization metadata | 9/10 | Fixed and regression-tested |
| S-05 | MEDIUM (conditional) | Rate-limit security-definer RPC may be executable by PUBLIC | 6/10 | Mitigation deployed per owner; grants not independently verified |
| S-06 | MEDIUM | Authenticated users can change any organization's status | 9/10 | Fixed and regression-tested |
| S-07 | MEDIUM | Issuer admins can create issuers in another organization | 9/10 | Fixed and regression-tested |
| S-08 | MEDIUM | Any authenticated user can create an organization and reassign their account | 9/10 | Fixed and regression-tested |
| S-09 | MEDIUM | Public verification lacked rate and request-size limits | 9/10 | Fixed with 30/15m per-IP limit and 5 MiB body cap |
| S-10 | LOW | Application responses lacked baseline browser security headers | 9/10 | Fixed in Next.js response configuration; deployment verification pending |
| S-11 | MEDIUM (conditional) | Static deploy workflow injected a purported private key through a `NEXT_PUBLIC_*` variable | 8/10 | Removed from workflow; rotate secret if it contained a real private key |

No CRITICAL finding was confirmed from repository evidence.

## Findings

### S-01 — Self-service user updates may change roles and organization membership

- **Severity:** HIGH
- **Description:** At the time of the initial review, the `users_self_update` RLS policy permitted updates to the caller's own row based on `auth_user_id` without limiting mutable columns. The application reads `roles` and `organization_id` from that row when resolving the current user.
- **Attack scenario:** An authenticated issuer submits a direct Supabase update to their own `users` row, adding `issuer-admin` to `roles` and changing `organization_id` to a victim organization's ID. Subsequent application requests may treat the user as an administrator in that organization.
- **Impact:** Potential cross-tenant access and unauthorized administration. A promoted administrator can reach issuer-transfer functionality; the transfer service performs a service-role update by issuer ID without verifying current organization ownership, amplifying the risk.
- **Affected files:**
  - `database/migrations/003_supabase_auth.sql:84-86`
  - `lib/auth.ts:160-188`
  - `app/api/issuers/handler.ts:95-117`
  - `services/IssuerService.ts:80-89`
- **Recommended fix:** Remove broad self-update permission. If users need profile edits, expose only safe columns through column-level grants or a narrowly scoped RPC. Restrict role and organization membership changes to a trusted administrative path; validate current and target organization ownership within the same transaction. Add adversarial RLS/API tests for changing `roles`, `organization_id`, and issuer ownership.
- **Remediation status:** Migration `011_security_boundary_hardening.sql` drops the self-update policy and revokes user-table updates from public application roles. Issuer listing and transfer routes now enforce organization/platform-admin boundaries. The migration regression test passes; owner reports it is applied, but production grants were not independently queried.
- **Estimated effort:** 1–2 days including migration, tests, and hosted-grant verification.
- **Deployment dependency:** Exploitation depends on production Supabase grants allowing authenticated users to update their own row. The repository policy itself is unsafe absent compensating grants.

### S-02 — Public credential verification can trigger DID-resolution SSRF

- **Severity:** MEDIUM
- **Description:** The unauthenticated verification endpoint accepts a credential from the caller. The ECDSA-SD verification path resolves the credential-controlled issuer DID before cryptographic verification. The DID resolver converts `did:web` into an HTTPS request and the inspected path has no restriction against loopback, private, or link-local destinations.
- **Attack scenario:** An attacker submits a credential whose issuer and proof verification method refer to a chosen `did:web` hostname. Verification causes the server to fetch that hostname before the proof is accepted or rejected.
- **Impact:** Blind SSRF and internal service probing. The application response does not appear to return the fetched DID document, limiting direct extraction. Practical reach depends on deployment DNS, TLS, redirects, and network egress.
- **Affected files:**
  - `app/api/verify/route.ts:27-58`
  - `lib/trustvc.ts:1031-1039, 1303-1325`
  - Installed resolver path inspected: `node_modules/web-did-resolver/lib/resolver.cjs:201-222`
- **Recommended fix:** Use a DID resolver with SSRF controls: reject private, loopback, link-local, and reserved destinations after DNS resolution; revalidate every redirect and resolved address; cap redirects, response size, and timeouts. Enforce network-level egress restrictions. Consider an issuer allowlist only if it does not break supported credential interoperability.
- **Remediation status:** `/api/verify` now injects a server-side safe document loader that enforces HTTPS, public-address DNS resolution and pinning, redirect revalidation, response/time bounds, and DID-document identity checks. Local DID/context mappings remain available. Focused loader tests and the production build pass; validate representative external DID providers and deployment egress in staging.
- **Estimated effort:** 2–5 days including resolver behavior tests and deployment egress validation.
- **Compatibility note:** Preserve verification for existing public `did:web` credentials while rejecting unsafe destinations.

### S-03 — Authentication redirects accept protocol-relative external destinations

- **Severity:** MEDIUM
- **Description:** The callback and login UI accept `next` when it merely begins with `/`. A value such as `//attacker.example/path` satisfies that check but is interpreted as an external origin by URL navigation/redirect handling.
- **Attack scenario:** An attacker sends a login link containing `next=//attacker.example`. After successful login or callback processing, the user is redirected to the attacker's site from a trusted authentication flow.
- **Impact:** Phishing and abuse of the trusted application domain. The redirect does not by itself disclose a session token, but increases the credibility of follow-on social engineering.
- **Affected files:**
  - `app/auth/callback/route.ts:24, 56`
  - `app/issuer/page.tsx:70-71`
- **Recommended fix:** Normalize destinations against the application origin and reject protocol-relative URLs, backslashes, control characters, and malformed paths. Prefer a strict allowlist of internal route paths. Add tests for `//host`, encoded separators, backslashes, and normal internal destinations.
- **Remediation status:** Callback and login navigation now share `safeInternalPath`; tests cover internal paths and hostile redirect forms.
- **Estimated effort:** Under 1 day.

### S-04 — Authenticated users can enumerate organization metadata

- **Severity:** LOW
- **Description:** The organizations API requires authentication but does not require a platform-admin role. It calls a service-role-backed listing method that returns all organizations, including disabled organizations.
- **Attack scenario:** Any authenticated issuer user requests the organization endpoint and enumerates tenant names, slugs, IDs, and status values.
- **Impact:** Cross-tenant metadata disclosure and useful reconnaissance for targeted attacks. The reviewed endpoint does not return credentials or direct tenant records.
- **Affected files:**
  - `app/api/organizations/handler.ts:11-17`
  - `services/OrganizationService.ts:69-80`
- **Recommended fix:** Restrict listing to an explicit platform-admin role, or return only the caller's organization where tenant selection is not required. Add an authorization test proving ordinary issuer users cannot enumerate.
- **Remediation status:** Organization directory access now requires platform-admin, and issuer lists are restricted to the caller's organization except for platform-admin requests. Authorization regression tests pass.
- **Estimated effort:** Under 1 day.

### S-05 — Rate-limit security-definer RPC may be executable by PUBLIC

- **Severity:** MEDIUM (conditional; validate hosted grants)
- **Description:** `enforce_auth_rate_limit` is declared `SECURITY DEFINER`; the reviewed migration does not visibly revoke execution from `PUBLIC`. PostgreSQL grants function execution to `PUBLIC` by default. Depending on the function signature/body and hosted grants, callers may be able to alter or consume rate-limit state outside the intended server-authenticated flow.
- **Attack scenario:** If callable by anonymous or authenticated database roles, a caller invokes the RPC directly with chosen bucket keys to consume or manipulate limiter state, causing targeted account/login denial of service or weakening effective throttling.
- **Impact:** Authentication-flow denial of service or rate-limit bypass, depending on the function implementation and deployed grants.
- **Affected files:**
  - `database/migrations/004_supabase_api_only.sql:4-31`
  - Callers: `lib/auth.ts:52-123`, `app/api/auth/login/handler.ts:16-17`, `app/api/auth/reset-request/handler.ts:17-28`
- **Recommended fix:** Revoke execution from `PUBLIC`, `anon`, and `authenticated`; grant only to the minimum server-side role that calls the RPC. Review `SECURITY DEFINER` ownership, `search_path`, input constraints, and whether the caller can forge bucket identity. Verify actual grants in production.
- **Remediation status:** Migration `011_security_boundary_hardening.sql` revokes execution from `PUBLIC`, `anon`, and `authenticated`, then grants it to `service_role`. Its migration test passes; owner reports it is applied, but deployed grants/function ownership still need independent verification.
- **Estimated effort:** 0.5–1 day including migration and tests.
- **Confidence note:** The migration declaration and missing revoke were confirmed; direct exploitability is conditional on actual Supabase grants and function behavior.

### S-06 — Organization status changes lack administrative authorization

- **Severity:** MEDIUM
- **Description:** The organization `[id]` PATCH handler required authentication but did not require `platform-admin` or verify the organization belonged to the caller. It accepted status values from the request and called the service-role-backed update by ID.
- **Attack scenario:** Any authenticated user sends a PATCH for another tenant's organization ID with `status: "disabled"` (or reactivates a disabled organization).
- **Impact:** Unauthorized tenant lifecycle changes, potentially disrupting or restoring access for another organization.
- **Affected files:**
  - `app/api/organizations/[id]/handler.ts`
  - `services/OrganizationService.ts`
- **Recommended fix:** Require platform-admin authorization and validate status against the supported values before invoking the service.
- **Remediation status:** PATCH now requires platform-admin and accepts only `active` or `disabled`. Regression tests prove denial, invalid-status rejection, and authorized update behavior.

### S-07 — Issuer creation accepts an untrusted organization ID

- **Severity:** MEDIUM
- **Description:** Issuer creation accepted `organizationId` from the request and passed it to a service-role insert without checking whether the caller could administer that organization.
- **Attack scenario:** An issuer admin supplies a victim tenant's organization ID when creating an issuer, placing an attacker-controlled issuer record inside that tenant.
- **Impact:** Cross-tenant metadata manipulation and potential downstream confusion in issuer/template administration.
- **Affected files:**
  - `app/api/issuers/handler.ts`
  - `services/IssuerService.ts`
- **Recommended fix:** Force non-platform-admin issuer admins to use their session organization; reject attempts to specify another organization. Allow cross-organization creation only for platform-admin.
- **Remediation status:** Non-platform-admins are restricted to their session organization; platform-admins can explicitly select another organization. Regression tests cover both paths.

### S-08 — Organization creation could reassign any authenticated user's tenant

- **Severity:** MEDIUM
- **Description:** The organizations POST route allowed any authenticated caller. It used the service-role-backed `OrganizationService.create`, which creates an organization and updates the caller's `users.organization_id` to the new organization.
- **Attack scenario:** An authenticated user creates a new organization, causing the server-side service to move their account into that organization despite lacking platform-administration privileges.
- **Impact:** Unauthorized tenant membership changes and creation of unreviewed organizations, undermining tenant governance.
- **Affected files:**
  - `app/api/organizations/handler.ts`
  - `services/OrganizationService.ts`
- **Recommended fix:** Restrict organization creation to platform-admin and keep any self-service onboarding path separate, explicitly approved, and narrowly scoped.
- **Remediation status:** POST now requires `platform-admin`; a route regression test proves unauthorised organization creation stops before the service call.

### S-09 — Public verification lacked abuse and payload limits

- **Severity:** MEDIUM
- **Description:** The public verification endpoint parsed arbitrary JSON and performed expensive cryptographic verification and remote DID resolution without rate limiting or an application-level body-size cap. Its catch path also returned internal error messages to callers.
- **Attack scenario:** An unauthenticated client floods verification with large credentials or repeated hostile DID targets, consuming CPU, memory, database capacity, and outbound requests; failures could expose implementation or infrastructure error details.
- **Impact:** Resource-exhaustion risk, elevated service costs/latency, and unnecessary information disclosure.
- **Affected files:**
  - `app/api/verify/route.ts`
  - `lib/apiAuth.ts` (client identity is derived from forwarding headers; ingress behavior must be verified)
- **Recommended fix:** Rate-limit public verification, enforce a streaming request-size bound, and return generic server errors. Ensure the rate-limit client identity uses trusted ingress metadata.
- **Remediation status:** Verification now applies a 30-request/15-minute per-client limit, rejects bodies over 5 MiB while streaming, returns 413/429 as appropriate, and suppresses internal exception detail from the response. Confirm forwarded-IP header sanitization at the deployment edge.

### S-10 — Baseline browser security headers were absent

- **Severity:** LOW
- **Description:** Repository configuration did not set HSTS, MIME-sniffing protection, a referrer policy, clickjacking protection, or a permissions policy.
- **Attack scenario:** Missing browser policies can enable MIME confusion, framing-based UI redress, referrer leakage, or unnecessary browser capability access if another vulnerability or unsafe embedding path is introduced.
- **Impact:** Defense-in-depth gaps; no standalone exploit path was established in this review.
- **Affected files:**
  - `next.config.js`
- **Recommended fix:** Configure HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` or CSP `frame-ancestors`, and a least-privilege `Permissions-Policy`. Validate document embedding requirements before enforcing CSP.
- **Remediation status:** Next.js adds HSTS, nosniff, strict-origin-when-cross-origin referrer behavior, and a disabled camera/microphone/geolocation policy across routes. `X-Frame-Options: DENY` applies except to `/renderer/`, which is intentionally embeddable by external credential viewers. Verify these headers on deployed pages and APIs. CSP remains a staged follow-up because the compatible policy must account for Next.js and credential rendering.

### S-11 — Static deployment workflow passed a private-key-named value as public

- **Severity:** MEDIUM (conditional)
- **Description:** The GitHub Pages build wrote a GitHub secret named `NEXT_PUBLIC_DID_PRIVATE_KEY_MULTIBASE` into `.env.production`. The application did not reference this exact variable and no concrete private-key value was inspected, so actual credential exposure is unconfirmed. The variable name and static-build environment nevertheless created an avoidable path for accidental client bundling and mishandling.
- **Attack scenario:** If the GitHub secret held a real DID signing key and application code or a build plugin referenced the `NEXT_PUBLIC_*` variable, Next.js could inline it into public build artifacts.
- **Impact:** Potential issuer signing-key compromise, enabling fraudulent credential issuance; impact depends on the secret's actual value and whether it entered an artifact.
- **Affected files:**
  - `.github/workflows/deploy.yml`
- **Recommended fix:** Never inject private keys into static builds or use `NEXT_PUBLIC_*` for secrets. Rotate the key if the configured value was a real key and inspect historical public build artifacts.
- **Remediation status:** Removed the private-key variable from the static GitHub Pages workflow. The workflow now passes only public DID metadata using environment variables and `printf`. A regression test prevents reintroducing the unsafe variable. Check the secret value and historical artifacts outside this repository.

## Reviewed surfaces and security posture

| Area | Repository evidence / assessment |
|------|--------------------------------|
| Authentication and sessions | Supabase Auth integration and session resolution reviewed. Login and reset endpoints use database-backed rate limits. No production MFA enforcement evidence was found in the repository; hosted Supabase Auth settings must be checked. |
| Authorization and tenant isolation | User/organization RLS, issuer services, template ownership, API authorization, organization status/creation, issuer creation, and issuer transfer reviewed. S-01 and S-04/S-06 through S-08 mitigations are implemented; migration 011 is reported applied but not independently verified. |
| APIs and rate limits | Route authorization, public verification, auth rate-limit callers, error handling, and public status-list route validation reviewed. Verification now has a per-client limiter and streaming body cap. `x-forwarded-for` is used as an IP source; trustworthiness depends on ingress sanitization. |
| Supabase / database | Reviewed auth migration, RLS helpers, status-list migrations and relevant service-role access. Migration 011 restricts user updates and rate-limit RPC execution; owner reports it applied, but production table/function grants were not queried. |
| Secrets and key management | No concrete private key literal in application source was established. Multi-issuer configuration uses server-side key references and environment variables; verify Vercel environment scoping, access controls, backups, and key rotation operationally. The static build workflow no longer injects a private-key-named `NEXT_PUBLIC_*` variable; determine whether the prior GitHub secret was real key material and rotate if necessary. |
| DID and credential security | DID publication, status-list signatures, issuance, verification order, and profile key resolution reviewed. S-02 is mitigated in the verification route by a safe loader. DID host routing, public-provider compatibility, and public-key correctness require staging/live-domain validation. |
| OpenCerts / TradeTrust | Credential format, selective disclosure and verification integrations reviewed as part of issuance/verification flows. No additional concrete bypass finding was established in this pass. |
| Document Store / blockchain | Hash registration and profile/legacy revocation paths reviewed. Transaction signer authorization and supported network endpoints depend on deployment secrets/configuration and chain state. |
| Uploads and rendering | File/credential parsing and certificate rendering paths reviewed. No concrete unsafe HTML sink was established in the review. Test malformed and oversized credential JSON as defense-in-depth. |
| Email | Resend integration and password-reset flow reviewed through repository paths. Provider domain, templates, suppression settings, and production secrets were not independently verified. |
| Vercel, CORS, CSP, headers | Proxy and deployment configuration reviewed. Baseline security headers are now configured in Next.js; CSP and edge-level Vercel settings were not verified. DID/status publication intentionally uses public CORS. |
| Dependencies / supply chain | `package.json`, lockfile integrity metadata, and GitHub Actions references reviewed. No specific exploitable vulnerable package was confirmed. Run automated advisory scanning continuously and pin workflow actions to immutable SHAs. |
| Backups / recovery | No repository backup/restore runbook or tested database disaster-recovery procedure was found. Supabase PITR/backups and key recovery must be verified in the hosted project. Password recovery is not data recovery. |

## Informational risks and verification limits

- `lib/apiAuth.ts` takes the first `x-forwarded-for` value as the client IP. Rate-limit evasion is possible if the production ingress preserves client-supplied forwarding headers; confirm Vercel/edge behavior or derive the client IP only from trusted proxy metadata.
- CSP is not yet configured. Set it in report-only mode first, then enforce after testing the Next.js, Supabase, Resend, DID, and credential-rendering flows.
- Public verification rate limiting uses `clientIp()` from `x-forwarded-for`; confirm the Vercel ingress overwrites/sanitizes this value or change the source to a trusted proxy-provided client address before relying on per-IP quotas.
- No automated backup evidence was found in-repository. Confirm Supabase retention/PITR, point-in-time restore access, recovery objectives, and secure key backups outside the repository.
- Dependency and supply-chain review is a snapshot. Re-run advisory scanning against the current lockfile and production dependency graph before release.
- This is not a penetration test. No live Supabase, Vercel, RPC, SMTP, DNS, or blockchain environment was accessed.

## Provisional security score

**74/100 — repository-only assessment, not a production certification.** Identified application-level authorization, redirect, DID-resolution, verification-abuse, baseline-header, and unsafe static-build secret wiring gaps have local mitigations and regression coverage. The project owner reports migration 011 applied, but hosted grants, deployed headers, Vercel/network controls, forwarded-IP trust, CSP, MFA, backups, and secret operations remain unverified. Reassess after deployment evidence review.
