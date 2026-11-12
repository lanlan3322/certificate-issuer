# Phase 1 deployment and preservation checklist

This repository contains the migration, not evidence that a production database has been migrated. Do not run it against production without an approved backup and deployment window.

## Before deployment

1. Back up Supabase database schema, data and Auth identities; verify the backup can be restored.
2. Restore to a private staging project. Confirm migrations 001-014 are applied in order. Never re-run old seed migrations against production.
3. Inventory organizations, users, issuer assignments, memberships/legacy roles and any existing custom policies. Resolve unassigned issuer-role users explicitly; migration 012 only auto-assigned unambiguous single-issuer organizations. Do not choose an arbitrary issuer.
4. Review mixed administrator/operator accounts. Membership is a single organization role; migration 023 subsequently grants organization administrators issuance within their organization.
5. Capture row counts, existing IDs/organization assignments and exact stored credential content. Export `SELECT id, credential::text FROM credentials ORDER BY id` privately before and after the migration and compare files byte-for-byte; never place recipient data in Git or public logs.
6. Confirm at least one trusted application user has `platform-admin` or `platform_admin`. Do not grant platform access through membership or Auth metadata.
7. Check whether `verifiable-sg` already exists, including its status. Existing tenant assignments are retained; they are not consolidated into one organization.

## Apply and deploy

1. Pause application writes during the maintenance window. Deploy schema/application together; old application roles and RLS semantics are not interchangeable with the new membership model.
2. Apply [015_organization_foundation.sql](../database/migrations/015_organization_foundation.sql) **once**, using the existing controlled SQL deployment process. Its transaction rolls back failed schema changes automatically.
3. The migration extends organizations, creates the default organization and memberships, assigns null ownership, backfills template/credential organization IDs from issuers, then installs invariants, audits, helper functions and replacement RLS.
4. Existing organizations/issuers/users/templates/credentials keep their IDs. Existing owned records stay with their organization; only unowned legacy objects use Verifiable.sg. No signed credential JSON, issuance dates, signature dates, keys, DIDs or status-list bytes are rewritten.
5. Deploy the application built from the same revision. Resume writes only after the staging/production smoke checks below pass.

## Verification

Run read-only checks through the approved SQL console:

```sql
SELECT id, name, slug, status FROM organizations WHERE slug = 'verifiable-sg';
SELECT count(*) FROM users WHERE organization_id IS NULL;
SELECT count(*) FROM templates WHERE organization_id IS NULL;
SELECT count(*) FROM credentials WHERE organization_id IS NULL;
SELECT count(*) FROM templates t JOIN issuers i ON i.id = t.issuer_id
WHERE t.organization_id <> i.organization_id;
SELECT count(*) FROM credentials c JOIN issuers i ON i.id = c.issuer_id
WHERE c.organization_id <> i.organization_id;
SELECT count(*) FROM users u LEFT JOIN organization_members m
  ON m.user_id = u.id AND m.organization_id = u.organization_id WHERE m.id IS NULL;
```

All counts except the default organization listing should be zero. Compare all original counts/IDs, tenant assignments and the private credential-content export. Additional organization/membership/audit records are expected.

Use two organizations and all four roles to test both the application and authenticated PostgREST/RLS directly:

- Platform admin: list/create/edit/view/deactivate organizations; inspect users, change global roles, manage memberships and view credentials across tenants.
- Organization admin: manage own issuers/templates/members and issue, revoke and send for own active issuers after migrations 023 and 024; cannot edit organization lifecycle.
- Issuer: issue/revoke/send for assigned issuer; cannot create issuers, manage templates or elevate membership roles.
- Viewer: read own organization credentials, without write actions.
- Confirm foreign organization IDs, forged actors, cross-organization template references and issuer transfers are rejected.
- Downgrade/remove a membership and deactivate/soft-delete an organization with an existing session; workspace access must stop. Global admins retain recovery access.
- Confirm transactionally recorded organization/member audit actor, action, timestamp and target IDs.
- Verify an existing signed credential and newly issued single/batch credentials. Public verification should still work after organization deactivation.
- Existing login, invitation password setup/recovery, template rendering and issuer records must continue working. Public self-registration remains disabled as it was before Phase 1.

Repository validation:

```sh
node --test database/migrations/015_organization_foundation.test.js lib/permissions.test.js lib/apiAuth.test.js lib/api-router.test.js lib/issuer-assignment.test.js app/api/organization-foundation.test.js app/admin/page.test.js
node --test
npm run build
```

PGlite validates real PostgreSQL policy behavior against a representative legacy schema; it does not replace staging validation of the complete deployed Supabase environment. Record any pre-existing full-suite failures separately.

## Rollback

Do not delete organization/member data, drop tables, remove ownership columns or reassign signed history as a shortcut. Before writes resume, restore the verified backup if the migration/deployment fails. After writes resume, use a reviewed forward fix or a coordinated restore/reconciliation plan that preserves newly issued credentials and membership/audit changes. Rolling back application code alone while leaving the new authorization schema is not a supported rollback.
