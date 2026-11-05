# Phase 2: Multi-Issuer Architecture

## Architecture findings

Phase 1 already provides organizations, active-workspace memberships, canonical
RBAC, organization ownership and isolation. It is not replaced.

- `issuers` already has an organization, name, globally unique slug, contact
  email, DID URI, status and timestamps. Multiple issuers can already exist.
- Templates have nullable issuer ownership. Phase 1 permits organization-wide
  template sharing; issuance currently uses the logged-in user's issuer rather
  than the template's owner.
- Credentials already store issuer, template and organization references plus
  signing-profile snapshots. Historical records can reference a shared template
  belonging to another issuer. Signed credential bytes must not be rewritten.
- Users have one legacy `issuer_id`; organization memberships control Phase 1
  roles. There is no independent, multi-issuer user assignment.
- Issuer administration combines creation and invitation. Detail endpoints and
  RLS need the same issuer-level permissions as issuance, revocation and reads.
- Existing signing profiles and environment keys remain the only signing
  mechanisms. This phase adds metadata, not keys or DID infrastructure.

## Required changes and file impact

1. Add migration 016 with issuer display/code/profile metadata, soft deletion,
   issuer memberships, ownership validation, transactional audits and
   issuer-scoped RLS. Retain the legacy columns/API aliases.
2. Extend `IssuerService`, add membership operations, and extend the existing
   issuer handlers rather than introduce another administration API.
3. Extend `lib/permissions.ts` with issuer-scoped grants. Resolve current
   memberships on every authenticated request; client state is not authority.
4. Resolve issuance ownership from saved templates in the issue and credential
   persistence handlers. Validate assignment, organization, status and profile
   before signing. Use that issuer for status allocation and audit metadata.
5. Scope template/credential/revocation reads and writes to issuer memberships,
   retaining platform-wide and organization-admin read/management privileges.
6. Extend issuer administration, template builder, credential previews and
   verification presentation. No changes to cryptographic verification.

## Role decisions

- Platform admins manage every issuer, including soft deletion.
- Organization admins create/edit/deactivate issuers and manage assignments and
  templates within their active organization; they do not gain issuance.
- An explicit issuer membership grants `issuer_admin` template management,
  `issuer_operator` issue/revoke/send, or `viewer` read access, only for that
  issuer. It does not grant organization administration.
- Legacy operators receive operator membership; other legacy issuer-bound users
  receive viewer membership unless they already have administrative scope.
  Removing an issuer membership must remove its permission immediately.
- Organization-level viewers retain Phase 1 organization-wide read access when
  not bound to an issuer. Explicit issuer viewers cannot read sibling issuers.

## Migration and compatibility

Apply after migrations 001–015. Create **Verifiable.sg Main Issuer** in the
default organization and assign previously unowned default templates to it.
Preserve all existing valid tenant/issuer ownership, IDs, signed payloads,
hashes, status configuration and user assignments: moving already-owned tenants
to the default issuer would contradict organization isolation and backward
compatibility. Any unowned template in another organization receives that
organization's deterministic main issuer, not cross-tenant ownership.

Legacy credentials with missing template references receive an inactive legacy
template owned by their existing issuer. Existing historical shared-template
references are preserved; strict same-issuer ownership applies to new records.
Snapshots on legacy records come from stored signed issuer data where present,
with current metadata used only as a labelled migration fallback.

Use the existing Supabase/Postgres/RLS stack; no new dependencies or external
identity service are needed. Test a restored production backup before applying.
Migration execution and live Supabase acceptance are operator actions, not
silently performed by this implementation.

## Security implications

RLS policies are permissive/OR-combined, so replace broad Phase 1 object policies
rather than add apparently restrictive peers. Security-definer helpers must fix
their search path and derive identity from `auth.uid()`. Memberships must match
both the user's organization membership and the issuer's organization.

Enforce ownership in database triggers even for service-role writes. Prevent
issuer transfers, template transfers and credential ownership/snapshot changes.
Check issuer status before signing or externally revoking; inactive, suspended
and deleted issuers remain readable for historical verification.

Public verification displays issuer/organization labels from the submitted
signed credential, not an anonymous directory lookup. These labels do not imply
an additional cryptographic trust check. Never expose private keys or recipient
directories through public presentation.

## Validation and release gate

Test migration preservation, same-organization sibling isolation, cross-tenant
denials, every role, assignment removal, status transitions, unique codes,
template-driven issuance, legacy verification and audit atomicity. Run the full
repository suite and production build. Report pre-existing failures separately.
Do not claim production migration or deployed isolation until staging Supabase
and historical credential verification have been validated.

## Implemented schema and API compatibility

Migration 016 keeps the established column names: `name` is issuer name,
`display_name` is issuer display name, `slug` is the organization-local issuer
code, and `contact_email` is issuer email. API camel-case aliases are unchanged.
Added issuer fields are `display_name`, `description`, `logo_url`, `website`,
`verification_method`, `key_fingerprint`, `active`, and `created_by`.

The issuer `status` column changes from the old three-value enum to checked text
supporting `active`, `inactive`, `suspended`, `deleted`, and the retained
`disabled` compatibility alias. `active` is derived from status in the database.
Codes become unique on `(organization_id, slug)`, not globally. If previously
unowned legacy templates have duplicate slugs, only the conflicting unowned
slugs receive an ID-based suffix; IDs and signed documents remain unchanged.

`issuer_members` has a composite primary key `(issuer_id, user_id)`. Assignment
requires an existing application user and active-workspace organization
membership in the issuer's organization. No Auth account, invitation or
organization-role elevation is created by assignment.

Template issuer ownership and credential template ownership become non-null.
New credentials must use an active template owned by their issuer, including
platform-admin issuance. Ownership and issuance-time issuer snapshots are
immutable. The signing endpoint rejects `persist: false`; every successful
issuance must retain ownership and revocation records. Historical credentials
keep their existing template reference even where Phase 1 allowed sharing.

## Operator migration plan

1. Back up the database and restore to staging. Record counts and IDs for
   issuers/templates/credentials, signed credential values and document hashes.
   Confirm migration 015 and existing signing/status-list configuration.
2. Apply migration 016 as the database migration owner during a maintenance
   window. It runs in one transaction, backfills automatically, replaces broad
   object policies, and never deletes production rows or rewrites signed JSON.
   Deploy the matching application release with it; old organization-wide
   template sharing is intentionally no longer an issuance permission.
3. Compare original IDs, organization/issuer assignments, signed credential
   values and hashes. Check non-null ownership, code uniqueness and expected
   operator/viewer assignment backfills.
4. Validate direct PostgREST/RLS and API operations using two issuers in one
   organization and another tenant. Remove assignments while sessions are
   active and confirm immediate API denial. Test legacy login/invitations,
   issuer deactivation, issuance, revocation and historical public verification.
5. Promote only after staging passes. Do not automatically reverse this
   migration: use a reviewed forward fix or backup restoration. Rolling back
   application code alone restores obsolete sharing assumptions and is unsafe.

The implementation has **not** applied either migration 015 or 016 to a remote
database, deployed the application, generated keys, published DIDs, or changed
document-store/billing configuration.

## Audit and security review

Database triggers atomically record `issuer.created`, `issuer.edited`,
`issuer.disabled`, `issuer.user.added`, `issuer.user.updated`,
`issuer.user.removed`, `template.assigned_to_issuer`, and
`credential.issued_by_issuer`, with actor, organization, issuer, target and
timestamp. Existing application audit events remain for compatibility.
Trigger audit failures roll back the mutation.

Issuer reads require membership, organization administration, platform
administration, or the Phase 1 unbound organization-viewer exception described
above. Templates and credential records use the same issuer boundary.
Operators cannot manage issuers, memberships or templates. Issuer admins
cannot operate credentials unless separately assigned operator access.
Organization admins cannot soft-delete issuers. Physical issuer deletion is
revoked for authenticated clients. Deleted issuers cannot be restored by edits.

Signing, email and revocation reauthorize the actual resource issuer before
side effects. Template issuer assignment, organization matching and snapshot
immutability also run in database triggers, including elevated-client writes.
Issuer-profile reads using the service client have an explicit issuer access
check before fetching or returning profile metadata.

The requested final static security review found no exploitable vulnerabilities
in these Phase 2 boundaries. Real SQL/RLS tests run in PGlite; live Supabase
deployment and tenant-session acceptance remain a release gate.

## Files modified for Phase 2

| Surface | Implementation |
| --- | --- |
| Schema, migration and real RLS tests | `database/migrations/016_multi_issuer_foundation.sql`, `database/migrations/016_multi_issuer_foundation.test.js` |
| Authorization and identity | `lib/auth.ts`, `lib/permissions.ts`, `lib/apiAuth.ts`, `lib/issuer-access.ts`, `lib/issuer-input.ts` |
| Services | `services/IssuerService.ts`, `services/IssuerMemberService.ts`, `services/TemplateService.ts`, `services/CredentialService.ts` |
| Issuer lifecycle and assignment APIs | `app/api/issuers/handler.ts`, `app/api/issuers/[id]/handler.ts`, `app/api/issuers/[id]/members/handler.ts`, `app/api/[...resource]/route.ts` |
| Issuance and access APIs | `app/api/issue/route.ts`, `app/api/templates/handler.ts`, `app/api/issuer-profiles/handler.ts`, `app/api/credentials/handler.ts`, `app/api/credentials/send/handler.ts`, `app/api/revocation/handler.ts` |
| Presentation metadata | `lib/trustvc.ts`, `lib/certificate-types.ts`, `lib/issuer-presentation.ts`, `app/api/verify/route.ts`, `app/verify/page.tsx`, `components/IssuedCertificatesTable.tsx`, `components/CertificatePreviewModal.tsx` |
| Workspace UI and guides | `app/admin/page.tsx`, `app/templates/builder/page.tsx`, `app/branding/page.tsx`, `lib/navigation.ts`, `app/docs/user-manual/page.tsx`, `app/docs/admin-manual/page.tsx` |
| New focused tests | `app/api/multi-issuer.test.js`, `lib/issuer-access.test.js`, `app/templates/builder/page.test.js` |
| Updated regression tests | `app/admin/page.test.js`, `app/branding/page.test.js`, `app/api/issue/route.test.js`, `app/api/credentials/handler.test.js`, `app/api/credentials/send/handler.test.js`, `app/api/templates/handler.test.js`, `app/api/issuer-profiles/handler.test.js`, `app/api/security-boundaries.test.js`, `app/api/verify/route.test.js`, `app/api/routes.test.js`, `services/TemplateService.test.js`, `lib/apiAuth.test.js`, `lib/issuer-assignment.test.js`, `components/issuance-ui.test.js` |

Earlier Phase 1 and CaaS redesign modifications in the working tree are
preserved and are not represented as newly implemented Phase 2 changes here.

## Local test results

- Production build and TypeScript validation: **passed**.
- Phase 2 acceptance and tightly coupled regression selection: **111 passed,
  0 failed**. Includes executable SQL/RLS, lifecycle, assignment, role matrix,
  template-driven issuance, revocation, snapshot preservation, audit rollback,
  legacy invitation, verification presentation and UI interactions.
- Full repository suite: **363 tests, 348 passed, 15 failed**. Every failing
  test name is present in the pre-Phase 2 CaaS-redesign baseline. Remaining
  failures concern isolated TypeScript test-loader imports, existing TrustVC
  signing/name expectations and the existing status-list issuance test.
- Browser presentation test: signed-data display labels visible at 320, 375,
  768 and 1280 pixels without document overflow; preview Escape and focus
  restoration pass. The verification response was synthetic, so this is not a
  claim of cryptographic verification.
- Production HTTP smoke test: anonymous issuer-members API returns **401**
  directly, with no redirect hop. Formatting check passes.
- Migration was executed only in disposable PGlite databases. No real tenant
  data or keys were used. Remote migration, authenticated Supabase end-to-end
  acceptance and baseline test remediation remain release blockers.
