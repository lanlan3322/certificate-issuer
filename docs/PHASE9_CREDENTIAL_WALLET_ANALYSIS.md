# Phase 9: Credential wallet architecture

## Status

This increment provides a public landing page, email-link sign-in, verified-email credential matching, an isolated holder profile, a searchable credential dashboard and timeline, PDF and signed-JSON downloads, verification links and QR codes. It does **not** provide membership/certification classification, CPD records or aggregation, notifications, or professional-standing decisions: authoritative data and programme rules are not available. Standing is shown as unknown. Do not treat the role or profile table as an authorization system for credentials.

## Existing architecture

- Supabase Auth authenticates users. The issuer session in `lib/auth.ts` additionally requires a `public.users` record, an active organization and organization membership (with platform-admin exceptions). `users.organization_id` is required and the organization-membership trigger assumes every application user belongs to an organization. Holder accounts should therefore reference `auth.users` separately rather than creating a synthetic organization or membership.
- `credentials` belong to an issuer and organization and contain the signed document, recipient name and `recipient_email`, `external_id`, status, validity dates and an issuer snapshot. Issuance is issuer-scoped and signed documents must not be changed for wallet access. Historic documents can be stored as JSON objects or JSON strings.
- Existing issuer RLS and API authorization protect tenant and issuer access. The holder role is not a substitute for these checks and must not be added to `organization_members`. The existing issuer credential endpoints must not be reused to access holder data.
- Public `/verify/?id=...` uses `/api/verify`, which looks up a saved record with server privileges and returns verification results rather than the stored recipient document. Verification checks the cryptographic proof, recorded status and validity. A database status is not itself proof of verification.
- `/wallet` was an issuer-facing placeholder, not a holder wallet. The route is now public marketing only; no private data is rendered there.

## Implemented schema and role

Migration `025_credential_holder_profiles.sql` creates `credential_profiles`, keyed by a unique `auth.users` ID, with name, contact fields and timestamps. Authenticated users can read, insert and update only their own profile; column grants prohibit reassignment of ownership, identifiers and timestamps, and anonymous users have no access. Deleting the Auth user cascades to its profile. The profile's editable email is **display/contact data**, never evidence of email control or credential ownership. The migration also creates `wallet_audit_events`, inaccessible to authenticated and anonymous clients, with an atomic profile-change audit trigger.

The `credential_holder` role has `wallet.credentials.read` and `wallet.profile.manage` permissions, but no issuer, organization or issuer-wide credential permissions. This defines the future application permission vocabulary only: it is not assigned by the current issuer session. Wallet endpoints instead authorize directly using verified Auth identity and ownership checks. Existing issuer roles, RLS policies and signed credential records are unchanged.

## Ownership and identity model

The wallet compares the current verified Supabase Auth email with `credentials.recipient_email` server-side on every request, not request parameters, editable profile fields, unverified JWT metadata, or the issuer's application-user email. Matching uses the existing case-insensitive email column and does not correct erroneous addresses or whitespace in historical records; issuers must resolve unmatched records without changing the signed document. Email equality is evidence of mailbox control, **not proof that the current mailbox owner is the intended person**: shared, mistyped, reassigned or recycled email addresses can expose historical credentials. The product owner selected this matching approach and accepted the mailbox-reassignment risk. Establish recovery, dispute and issuer-correction procedures before production; stronger issuer-mediated or additional-factor claims may be necessary for sensitive credentials. An email change changes the matched set on the next request.

No persistent ownership claim is created: access follows the currently confirmed Auth email. A future explicit claim/ownership model should include credential ID, holder Auth ID, evidence type, claim time, lifecycle state and audit provenance; constraints must prevent holders from manufacturing or reassigning claims. Design a separate verified-identity association for future external identities or membership numbers; do not store national identifiers without a documented purpose, privacy assessment and appropriate protection.

`/api/wallet` validates the current Auth user and confirmed email, then uses a server-only service client with an exact `recipient_email` filter for every list, detail and action. The list returns metadata rather than the signed document; details require an ownership check. No broad `credentials` SELECT policy was added: permissive RLS policies combine with issuer policies and rows may contain private information. Responses are `private, no-store`. Tests exercise different users, unconfirmed/changed email, guessed IDs, and audit failure; production Supabase integration and cross-organization tests remain necessary.

## Domain models and UX

Credentials alone do not define reliable membership, certification, CPD or standing semantics. Add issuer-provided typed data and provenance rather than guessing categories from title text:

- Membership: type, member number, issuer/organization, validity, lifecycle and renewal date.
- Certification: awarding body, designation, validity and lifecycle.
- CPD: activity, completion date, hours/credits, units, source credential, approval state and accounting year. Define duplicate, revoked and expired-record treatment before aggregating.
- Standing: an authoritative programme-specific policy, evaluation date and reasons. Missing evidence, unsupported policies or failed verification must be shown as **unknown**, never automatically as good standing.
- Notifications: durable events, recipient ownership, delivery channel, read state, idempotency, scheduling and opt-out policy. Only label a notification sent after delivery succeeds.

The responsive wallet includes search, status filters (including suspended, not-yet-valid and unknown), and a chronological timeline from recorded dates. It distinguishes recorded status from a fresh verification result, reuses the certificate renderer and PDF component, and provides signed JSON downloads. Copy and QR sharing use the existing public verification URL with a disclosure notice. Portfolio categories are not guessed; public profiles and external publishing remain unavailable. Future mobile clients should use the same scoped APIs, not database or signing-key privileges.

## Audit and security requirements

`wallet_audit_events` records profile changes and credential detail views, plus client-reported download, copy and QR-generation actions, with Auth actor, time and credential reference. Profile-change audits are transactional; detail reads fail if their audit cannot be saved. Downloads and copy are browser actions: events represent client-reported initiation/copy, not proof that a file was saved or a recipient received a link; QR generation does not establish that it was scanned. If an event write fails after the browser action, the UI reports the error. Holders cannot write audit records directly. Define operational retention and access before rollout.

Protect authentication with existing Supabase session validation, email confirmation, rate limits, secure callback/redirect handling and generic authentication errors. Do not expose credentials through marketing, cached responses, shared URLs, logs or profile photos. Enforce CSRF/origin protections as appropriate for mutation endpoints and validate input server-side. Maintain issuance, revocation and verification authorization unchanged. The profile-table RLS tests in this increment cover cross-user isolation; a complete security review also requires integration tests against real Supabase Auth, production grants, credential APIs and verification paths.

## Migration and rollout

1. Back up the database and test migration 025 on a representative staging copy after migrations 001-024. It only adds a table, grants, policies and a trigger; no existing credentials are rewritten or reissued.
2. Verify policies and grants with actual authenticated, anonymous and service roles, including existing issuer accounts. Do not apply a migration to production from this repository without the deployment owner's approval.
3. Configure Supabase email-link sign-in and the callback URL in the Auth redirect allowlist; require email confirmation and test real same-browser PKCE flows, existing issuer accounts and provider rate limits. The application rejects unconfirmed accounts even if provider configuration is unsafe. No credential rows are backfilled or rewritten.
4. Validate legacy credentials and newly issued ones, cross-user and cross-organization denial, email changes, proof verification, downloads, sharing, audit and mobile layouts in staging. Reconcile imports and enable pilot users before general availability. Gate deployment operationally until these checks and privacy review pass; this increment has no application feature flag.
5. Add notifications only after delivery and scheduling infrastructure is available. Integrate authoritative membership and CPD sources before enabling standing calculations.

Rollback before any holder data is created can remove the new role usage and landing-page changes and, following an approved backup and data-retention review, the profile table. Once profiles exist, dropping the table destroys user data; disable access and preserve or export data according to policy instead. Existing issuance and verification do not depend on this table.

## Decisions required before release

The chosen initial assurance is automatic matching by confirmed email; the product owner has said professional-data sources are not yet available. Confirm recovery processes, authoritative membership/certification/CPD data sources, CPD accounting and standing rules for each programme, notification channels and schedule, and legal/retention requirements before enabling those capabilities. No IBS integration or relationship is assumed merely from the product vision.
