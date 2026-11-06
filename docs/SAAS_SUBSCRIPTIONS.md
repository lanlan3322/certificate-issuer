# Commercial SaaS subscriptions

## Plan contract

All prices are SGD per month. Database catalog `subscription_plans` is authoritative
for quotas and minimum contracted prices:

| Plan | Monthly price | Non-deleted issuers | Saved templates | Certificates / UTC month |
|---|---:|---:|---:|---:|
| Starter | 49 | 1 | 5 | 100 |
| Professional | 299 | 5 | 10 | 1,000 |
| Enterprise | From 899 | Unlimited | Unlimited | Unlimited |

Limits allow exactly the stated allowance and block the next creation. Existing
organizations are grandfathered on non-billable Enterprise until an explicit
platform-admin assignment. New organizations start on pending, non-billable
Starter; a platform administrator must activate/assign the contract before new
issuer/template/credential creation. No free trial or payment completion is
fabricated.

## Schema and migration

Apply [migration 022](../database/migrations/022_saas_subscriptions.sql) after
015-021, before runtime rollout. Rehearse on a staging backup first.
The migration locks organization/issuer/template/credential writes while
backfilling and installing triggers, so concurrent writes cannot escape accounting.
Schedule an appropriate maintenance window for large datasets.

The original `subscriptions` table from migration 001 is extended, not replaced.
Its IDs, organization relation and legacy columns are preserved. Original plan
code, state, seat count and period end are copied into `legacy_metadata` before
grandfathering; no existing signed credential is rewritten. Old subscription
read policies are replaced with administrator-scoped RLS.

New subscription fields include `plan`, `status`, `started_at`, `renewed_at`,
`renews_at`, `expires_at`, `billable`, `monthly_price_cents`, `grandfathered`,
contract `version`, and an internal `usage_revision`. Status is pending, active,
suspended, expired or canceled. Effective expiry blocks creation even if the
stored status remains active. Renewal date is informational; expiry controls
access. No scheduler charges or renews subscriptions.

`organization_usage_monthly` records successful issuer/template/certificate
creations by UTC calendar month. Existing records are backfilled using stored
creation/issuance timestamps. New counters always use database time, never a
client-supplied certificate date. `subscription_requests` keeps at most one
pending organization plan request, resolved by a platform-admin assignment.

## Usage and enforcement

Database triggers cover normal APIs, agent tools, batches, invitation provisioning
and service-role inserts. The subscription row is locked before checking quotas;
the internal revision is updated so stale repeatable-read writers must retry
rather than overspend. Accounting and creation commit or roll back together.
Plan assignments take the same row lock and use optimistic contract versions.
An upgrade does not reset usage; a downgrade may block new creation immediately
without deleting existing resources.

Certificates are counted on successful persistence, including a signed credential
whose later blockchain registration fails. Revocation, expiry and suspension do
not refund issuance. Failed/duplicate/rolled-back inserts do not increment usage.
The monthly period resets at 00:00 UTC on the first, without a cron task or credit
carry-forward. Issuer/template creation counters are monthly activity metrics;
their quotas use current non-deleted issuers and existing saved templates.
Inactive issuers and deactivated templates still consume slots.

Storage is measured as the UTF-8 bytes of retained credential and template JSON
text, not total physical PostgreSQL size, backups, logs, encrypted keys or object
storage. Storage has no quota in the supplied plans. No unsupported storage price
or allowance is invented.

At 80% of a finite allowance, Billing & usage displays a warning; at the limit,
it advises requesting an upgrade. This is an in-app warning, not an email or
background notification service. Unlimited plans never receive finite-quota
warnings. Suspended/expired/pending/canceled subscriptions block new creation,
but do not remove read access, public verification, updates or revocation.
Existing organization/issuer lifecycle and RBAC restrictions still apply.

## Billing abstraction

[BillingProvider](../lib/billing-provider.ts) defines provider-neutral checkout,
customer portal and authenticated webhook normalization boundaries. Adapters are
selected by explicit injection, not by a hardcoded processor. Stripe, HitPay,
Xfers/Singapore processors or another provider may implement it. Missing adapters
raise an explicit unavailable error; no fake checkout or success webhook exists.
No provider SDK, credentials, spend or new package dependency is introduced.

Existing official provider APIs can supply these adapters; there is no need to
build a payment processor. Before enabling a real adapter, implement signed
webhook validation, durable provider-event idempotency, external customer mapping,
out-of-order event handling, reconciliation, tax/invoice/refund rules and
provider-specific checkout tests. Browser checkout completion must never grant
entitlements directly.

Until then, platform administrators explicitly record manually arranged contracts,
renewals and expiry. Organization administrators request plan changes only.
Annual prices shown on the plans page remain sales quotes, not implemented
annual billing or discounts in MRR. Add-ons require a separately agreed plan
change; no automatic overage purchase is supported.

## APIs and RBAC

`GET /api/subscriptions` returns own-organization subscription, usage, limits,
pending request and warnings. Platform admins can select `organizationId`.
`GET /api/subscriptions?scope=platform` returns platform metrics, platform-only.
`GET /api/subscriptions?scope=directory&offset=0` returns 50 subscriptions per
page with organization names and pending requests first, platform-only. The
dashboard provides pagination and explicit organization review actions.
`POST /api/subscriptions` supports `request` for organization admins and `assign`
for platform admins. Writes require same-origin sessions, a bounded 4 KiB JSON
body, validated dates/prices and a current contract version.

| Permission | Platform admin | Organization admin | Issuer / viewer |
|---|---|---|---|
| `billing.read` | All organizations | Own organization | No |
| `billing.manage` | Assign contracts / view financial metrics | No | No |
| Plan request | Yes | Own organization | No |

Direct table writes and management RPC execution are revoked from public,
anonymous and authenticated roles. Direct writes are also revoked from the service
role; server-only RPCs recheck the actual actor and organization membership.
Read snapshots/metrics are service-only RPCs behind authorized routes; they are
not anonymous Supabase RPC endpoints. Administrative actions are audited.
Existing public platform counters are not extended with financial information.

Quota errors map to safe `409 SUBSCRIPTION_LIMIT` or `403 SUBSCRIPTION_INACTIVE`
responses. Other billing failures surface explicitly, never as zero usage/revenue.

## Dashboards and analytics

`/billing` shows current plan, effective status, last/next renewal, expiry,
limits, monthly activity, scoped JSON storage and warnings. Platform admins select
organizations and assign contracts. `/platform` and platform billing show
contracted MRR/ARR, organizations, active issuers, total/current-month credential
volume, recorded verification checks, subscription counts and pending requests.

MRR sums active, unexpired billable contracts in active, non-deleted organizations;
grandfathered and non-billable access contributes zero. Enterprise uses its
explicit contract price (at least SGD 899). ARR is MRR times twelve. These are
contracted run rates, not collected payments, recognized revenue or tax-inclusive
invoices.

Public verification writes existing telemetry through the server-only client
(anonymous clients cannot insert under RLS); invalid source-IP metadata becomes
null. Verification volume counts recorded checks, not unique people or guaranteed
successful verifications. Failed telemetry is explicitly logged by the existing
verification route without disabling credential verification.

## Acceptance and rollout

Tests must cover Starter/Professional exact limits, Enterprise unlimited,
backfilled and failed creation accounting, UTC resets, upgrades/downgrades,
inactive access, contract version conflicts, grandfathered revenue exclusion,
tenant/RBAC enforcement, provider-unavailable behavior and dashboard interactions.
Run focused tests, the production build and compare full-suite failures with
the prior baseline.

No live database migration, payment setup, charge or deployment is performed by
this implementation. Stage simultaneous requests against real PostgreSQL/
PostgREST and rehearse legacy subscription migration before production activation.

### Local validation results

- **32 focused tests passed**, including executable PostgreSQL migration, exact
  limits, multi-row insert enforcement, rollback/conflict accounting, unlimited
  access, UTC resets, upgrades, RLS, APIs, provider abstraction and dashboards.
- `npm run build` **passed**, including TypeScript validation.
- Full suite: **478 tests, 463 passed, 15 failed**. All 15 failing test names
  exactly match the preceding 459-test baseline; no new failing names.
- Compiled-runtime anonymous smoke test: subscription, metrics and directory
  APIs returned **401**; Billing & usage redirected to sign-in. This used
  synthetic local Supabase configuration, not a live authenticated tenant.
- Production browser JavaScript contained no server subscription service/RPC,
  Supabase service key or issuer/transaction private-key configuration matches.

Live authenticated Supabase UI validation, concurrent multi-connection quota
testing and payment-provider acceptance remain staging gates. No production
payment capability is claimed.
