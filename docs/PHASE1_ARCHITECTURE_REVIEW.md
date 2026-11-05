# Phase 1: Multi-Organization Foundation

## Current architecture

The application is **partially multi-tenant already**, not single-tenant:

- Migration 001 creates organizations, organization-owned issuers/users, issuer-owned templates/credentials, and organization-scoped audit logs.
- Supabase Auth authenticates identities. `users.auth_user_id` links an Auth identity to an application user. Migration 012 binds that user to an issuer.
- `getCurrentIssuerUser` requires an active issuer and an organization, but does not check organization status. Roles currently use `platform-admin`, `issuer-admin`, `issuer-operator`, and `verifier`.
- RLS from migration 003 mainly scopes access through the user's organization. Some broad `FOR ALL` policies do not enforce role-specific write permissions. Migration 007 also confuses application user IDs with Auth IDs.
- Templates and credentials lack explicit organization ownership. Global templates have no issuer. Issuance permits sharing visual templates within an organization without changing signing identity.
- Platform admins can list credentials across issuers using a server-only service client. Ordinary users list their issuer's credentials. Send and revoke remain issuer-bound.
- Organization creation currently attempts to move the creator's user into the new organization. Organization editing is status-only, and membership records do not exist.
- The catch-all API dispatcher uses exact route keys, so dynamic organization/issuer URLs need explicit routing support.
- Existing DID profiles, status lists, signing and public verification are established functionality, not Phase 1 features to replace.

## Required changes

1. Extend organizations with display name, website, logo URL, creator and soft-delete timestamp. Preserve existing status values (`active`, `disabled`) and IDs.
2. Introduce organization memberships linked to application users. Canonical roles are `platform_admin`, `organization_admin`, `issuer`, and `viewer`. Preserve legacy role aliases at the boundary.
3. Keep the existing user's organization as their active workspace. Memberships authorize that workspace; do not silently switch organizations or infer membership from request input.
4. Backfill direct template and credential organization IDs from their issuer. Assign unowned legacy objects to the `verifiable-sg` default organization without moving existing tenants.
5. Centralize permission checks and enforce them in handlers and RLS. Protect organization lifecycle operations exclusively for platform admins. Organization admins manage their own issuers/templates/members; the single membership role does not additionally grant issuance or revocation.
6. Add complete organization administration and membership APIs/UI. Membership assignment does not create Auth accounts or implement enterprise onboarding.
7. Preserve issuer ownership, signed credential bytes, public verification, legacy login, template sharing and existing issuance settings.
8. Use transactional database operations/triggers for organization/member audits so audit failure cannot silently accompany a successful mutation.

## Decisions and scope

- Organization deletion is **soft deletion**, never cascading physical deletion.
- Existing organizations retain their IDs and data. Only records without ownership move into the default organization.
- The request's explicit “only platform_admin may edit organizations” rule takes precedence over the broader “manage own organization” wording for organization admins. They can view their organization and manage its members/issuers/templates, but cannot edit its lifecycle/profile.
- A user may have memberships in multiple organizations, but Phase 1 keeps the existing active organization. No implicit workspace switching or issuer reassignment.
- Canonical platform administration is a global user role, not a role an organization administrator can grant through membership management.
- Public signature verification remains available after tenant deactivation. Deactivation blocks authenticated workspace operations, not historical cryptographic verification.
- No new key generation, DID portal, self-managed DIDs, document-store management, billing, or enterprise onboarding is included.

## Risks

- Role normalization must not promote ordinary users. Legacy issuer admins map to organization admins; legacy operators map to issuers; verifiers map to viewers.
- Supabase permissive policies combine with OR. Old broad policies must be replaced rather than supplemented.
- Service-role access bypasses RLS; every elevated API path must authenticate and authorize before access.
- Membership deletion must revoke workspace access even with an existing valid Auth session. Role changes must take effect on the next request.
- Template and credential tenant IDs must match their issuer, and cross-organization template references must not be used to transfer ownership.
- Moving issuers between organizations can orphan historical ownership and signing configuration. Phase 1 rejects all issuer transfers rather than silently moving signed history.
- Existing ambiguous users without an issuer must not be arbitrarily attached to a different issuer. Platform/organization admins and viewers should be able to authenticate without a signing issuer, while issuance must require one.
- Migration adds constraints/indexes and backfills data; test on a restored database and schedule appropriately before production.

## Migration strategy

1. Back up the production database and restore to a non-production Supabase instance. Record row counts and a sample of signed credential hashes.
2. Apply migrations 001–014 as already deployed; apply additive migration 015 in a transaction.
3. Ensure the `verifiable-sg` default organization exists. Preserve all existing organization assignments. Backfill null ownership only, and memberships from current users/roles.
4. Add ownership synchronization/validation, indexes, membership helpers, role-aware RLS, and transactional organization/member audits.
5. Deploy application code together with migration 015. No fallback to legacy roles after membership removal.
6. Validate all roles against at least two organizations, including direct authenticated SQL/PostgREST, API requests, issuance, existing credential verification, and deactivated organizations.
7. Compare row counts, IDs, signed payloads and verification outcomes. Production migration is a separate operator action; implementation does not execute it remotely.
8. Rollback uses the backup or a reviewed forward migration. Do not delete organizations, memberships, columns or historical credentials as an automated rollback.

## Validation plan

- Execute migration tests in PGlite with actual roles/RLS and two organizations.
- Unit-test canonical and legacy role permissions, tenant restrictions and membership access.
- API-test organization CRUD, membership mutations, role restrictions, request-input spoofing and unauthenticated access.
- Regression-test issuance, signed credential verification and existing UI behavior.
- Run all repository tests and `npm run build`; report baseline failures separately rather than weakening assertions to claim success.

## Implementation references

- [RLS policies and service-role boundaries](./PHASE1_RLS.md)
- [Operator deployment, preservation checks and rollback](./PHASE1_MIGRATION.md)
- [Additive schema migration](../database/migrations/015_organization_foundation.sql)
- [Reusable role permissions](../lib/permissions.ts)

The implementation adds organization administration, membership role management and a platform user directory/global-role control. It does not create an alternate account-onboarding or workspace-switching workflow. Production application and full deployed-Supabase validation are separate operator actions.

## Local validation results

- Phase 1 acceptance and issuance regression selection: **108 passed, 0 failed**.
- Production build (`npm run build`) and `git diff --check`: passed.
- Full repository suite (`node --test`): **335 tests, 315 passed, 20 failed**.
- Pre-change baseline: **309 tests, 288 passed, 21 failed**. All remaining failure names were already present in the baseline. The directly changed dashboard action contract was updated to check permission-gated credential issuance.
- Remaining baseline failures include test-loader module resolution, stale overview/navigation/table assertions, TrustVC certificate-format assertions and the existing status-list issuance expectation. No blanket all-tests-passed or production verification claim is made.
- Real PostgreSQL RLS tests cover two-organization isolation, canonical/legacy roles, membership revocation/downgrades, deactivation, ownership mismatch, invitation retry aliases, global-role escalation prevention, transactional audit failure rollback and exact preservation of stored signed credential strings.

Release validation remains incomplete until the pre-existing full-suite failures are resolved and the migration, login, issuance and public verification checks are performed on the restored/deployed Supabase environment. No production migration has been applied by this implementation.
