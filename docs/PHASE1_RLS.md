# Phase 1 organization authorization

Migration: [015_organization_foundation.sql](../database/migrations/015_organization_foundation.sql).

## Identity and roles

Supabase Auth verifies the cookie identity; `users.auth_user_id` resolves the application user. Never trust a request's role, organization or Auth metadata for authorization.

`platform_admin` is a global role in `users.roles`. Memberships permit only `organization_admin`, `issuer` and `viewer`. Legacy aliases remain accepted: `platform-admin`, `issuer-admin`, `issuer-operator`, `verifier`. Organization administrators cannot grant platform privileges.

The existing `users.organization_id` remains the active workspace. Memberships may represent other organizations, but do not switch workspaces or change the user's signing issuer. Phase 1 does not implement a workspace switcher. Existing invitations create users within their intended organization. For existing accounts, membership assignment alone does not move their active workspace.

| Permission | Platform admin | Organization admin | Issuer | Viewer |
|---|---|---|---|---|
| Organization lifecycle/profile | All | Read own | Read own | Read own |
| Memberships | All | Own organization | Read own membership | Read own membership |
| Global user directory/platform roles | All | No | No | No |
| Issuers/templates | All | Manage own organization | Read own organization | Read own organization |
| Credentials | All | Read own organization | Read own organization; issue/revoke/send for assigned issuer | Read own organization |

Organization administration does not imply issuance. A legacy user holding both administrator and operator roles migrates to the single `organization_admin` membership role. Review mixed-role accounts before deployment; explicit least-privilege separation is intentional. Issuance always needs an active assigned issuer. No arbitrary issuer fallback is permitted.

## Database helpers

- `phase1_owns_organization`: global admin, or an active, non-deleted organization's membership matching the current workspace and optional allowed membership roles.
- `phase1_platform_admin`: global application-user role, resolved through `auth.uid()`.
- `current_app_user`, `current_organization_id`, `has_role`: membership-backed replacements for legacy helper signatures, including old role aliases.
- Organization deactivation, soft deletion, membership removal and membership role changes apply to the next database statement/request, even with a valid existing Auth session. Global admins retain administrative recovery access.
- Helpers use a fixed `search_path` and security-definer execution to avoid recursive RLS. Sensitive mutation helpers are not executable by public/anonymous callers.

## Policies

Migration 015 replaces **all existing policies** on the tables below. PostgreSQL permissive policies combine with OR; leaving the old `FOR ALL` policies would defeat the new restrictions.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| organizations | Active workspace member or global admin | Global admin, creator must equal authenticated app user | Global admin | Not granted; API soft-deletes |
| organization_members | Own membership or organization/global admin | Organization/global admin | Organization/global admin; identity immutable | Organization/global admin |
| users | Self or organization/global admin | No authenticated policy | No direct authenticated policy | No authenticated policy |
| issuers | Organization member/global admin | Organization/global admin | Organization/global admin; organization immutable | No policy |
| templates | Organization member/global admin | Organization/global admin | Organization/global admin; owner immutable | No policy; API deactivates |
| credentials | Organization member/global admin | Issuer membership and assigned active issuer, or global admin | Assigned issuer membership/global admin | No policy |
| revocations | Organization member/global admin | Assigned issuer membership/global admin; credential and issuer must match | No policy | No policy |
| audit_logs | Organization/global admin | Authenticated actor in accessible organization; triggers also insert | No policy | No policy |

Ownership triggers populate organization IDs from the issuer and reject ownership reassignment, including elevated/service-role writes. New credential template references must belong to the credential organization, except for explicit global-admin template selection. Historical references are preserved without rewriting signed payloads. Issuer-less legacy templates belong to the default organization.

Existing dependent issuer-profile and status-list policies continue to use the replaced organization/role helpers. Existing service-only status-list signing/revocation RPCs remain service-only; no key/DID/document-store workflow is added.

## Elevated boundaries and audits

Session clients and RLS enforce organization/member/issuer/template CRUD and catalogs. The platform-wide credential directory uses the server-only service client only after platform authorization. Invitation provisioning and existing signing/status-list workflows also use elevated clients; handlers/RPCs validate permissions, organization ownership and the active organization first.

Invitation RPC signatures and reservation/retry behavior are preserved. Their actor checks now use active organization memberships instead of stale legacy role arrays. They remain service-role-only. New-user triggers populate memberships, and invitations explicitly attribute membership creation to the requesting actor.

Organization create/update/soft-delete and membership add/update/remove are audited in the **same transaction** by triggers. Stored events include actor (`user_id`), action, target (`entity_id`), organization and timestamp. Backfill/system operations without an Auth actor are not misattributed to a human. Service-only invitations explicitly supply the validated actor. Audit failure aborts the associated transaction.

`phase1_set_platform_admin` is the only new authenticated global-role mutation RPC. It rechecks global admin status, rejects null input, serializes changes, preserves at least one platform administrator and audits the change transactionally. Removing global privilege falls back to the existing membership, not legacy user roles.

Public credential verification remains a narrowly scoped elevated lookup, not a credential directory. Organization deactivation must not invalidate historical signatures or expose recipient records publicly.
