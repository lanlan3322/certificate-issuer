# Phase 4: Managed organization DID infrastructure

## Architecture review (before implementation)

The existing application already uses DID Core, did:web, Multikey and TrustVC's
ecdsa-sd-2023 suite. Reuse those maintained libraries and the existing safe
document loader; do not introduce a custom DID protocol or a paid resolver.

- Organizations and memberships own issuers, templates and credentials.
- Phase 3 generates encrypted P-256 issuer keys. Initial keys are pending until
  their public verification methods can be resolved. Legacy imported keys retain
  immutable controller/method bindings and existing credentials retain signed bytes.
- The legacy root DID and JWKS are published from historical documents plus
  configured public material. Profile DID documents support root hostnames only.
- Publication and status routes currently infer root DIDs from hosts. The
  protected identity registry edits existing metadata; it is not a DID portal.
- Issuance selects an issuer-owned key and records its key/identity snapshot.
  Templates can still hold legacy identity/document-store metadata.
- Bitstring status allocation is durable and revocation-aware. The current
  URL/profile and verifier only accept root-host DIDs; path DIDs require a
  bounded organization-specific status URL extension.

Evidence: `lib/did-publication.ts`, `proxy.ts`,
`services/IssuerKeyService.ts`, `services/StatusListService.ts`,
`lib/trustvc.ts`, migrations 015–017.

## Decisions and compatibility constraints

The user approved:

1. Retain disabled/retired public methods for historical verification; block
   new signing rather than removing the verification material.
2. Use managed organization DIDs for new credentials while retaining historical
   signed credentials, legacy DID URLs and legacy status-list signers.

Removing assertion methods after disabling an issuer would break proof-purpose
verification. Historical methods therefore remain in verificationMethod and
assertionMethod; authentication includes only current active issuer methods.
Publication is not a revocation list. Credential lifecycle remains explicit.

One organization receives one immutable
`did:web:verifiable.sg:organizations:<original-slug>`, resolved at
`https://verifiable.sg/organizations/<original-slug>/did.json`.
Later organization renaming/slug editing must not rename that DID or reuse its
original path. Each key gets a globally distinct issuer/key-version fragment.
Public documents contain only the DID Core allowlisted public fields.

P-256 remains necessary for the installed ecdsa-sd-2023 stack. Managed binding
records are separate from Phase 3's immutable legacy key bindings, allowing
the same owned public key to authorize new organization-DID signatures without
rewriting or misrepresenting historical signatures. New managed keys publish
and become usable atomically with issuer creation; manual rotations remain
pending until explicit activation. No automatic rotation.

## Required changes

- Add one-to-one organization DID storage and public issuer-method mappings,
  generated transactionally on organization/key creation and rebuilt on issuer,
  organization or key lifecycle changes.
- Restrict authenticated database reads through tenant membership; no client
  insert/update/delete. Anonymous publication uses a narrow public projection,
  never ciphertext, recipient records, emails, profile secrets or PEM exports.
- Retain legacy root/profile DID and status routes unchanged. Add managed
  document and organization status publication through existing consolidated
  handlers/proxy rewrites, avoiding extra Vercel functions where practical.
- Resolve managed issuer binding during issuance and store exact DID, method,
  fingerprint, key and organization ownership. Keep legacy document-store
  metadata without allowing a template profile to select a different signer.
- Extend bounded status URL validation only for canonical managed organization
  paths; do not loosen arbitrary-origin, path, purpose, freshness or proof checks.
- Replace the identity navigation destination with a view-only organization DID
  page, preserving the legacy registry URL. Offer safe raw JSON and an audited
  explicit download; no editor, customer hostname or self-managed modes.
- Audit DID creation/update, issuer method addition/deactivation and download,
  without key material in audit metadata.

## Migration and risks

Migration 018 follows 015–017; it must not require master-key access or modify
encrypted private material. Backfill organization identities and public method
mappings from stored public keys. Activate only initial unbound pending keys;
leave pending rotations untouched. Preserve all legacy bindings, public methods,
signed bytes, credential URLs, template ownership and status allocations.

Missing encrypted keys remain a Phase 3 operator-backfill prerequisite; do not
invent a historical signer or silently substitute an environment secret.
Test against restored staging and live Supabase RLS before production rollout.
Do not run remote migrations, publish production identities, rotate real keys
or change secrets implicitly.

Public DID documents are intentionally public despite private management APIs.
Names in paths and issuer IDs in fragments must not be treated as secrets.
Lifecycle changes cannot erase signed history. Cross-tenant method assignment,
host-header influence, arbitrary JSON injection, row caps, cached authorization
and concurrent publication/signing are explicit test boundaries.

## Validation plan

Exercise organization/key provisioning, one-to-one immutable paths, lifecycle
history, public-only document shapes, tenant RLS/API permissions, audited
downloads, managed issuer signing, rotation, scoped status lists and legacy
verification. Run actual TrustVC proof/disclosure verification, focused SQL and
UI tests, the production build and the complete suite against the Phase 3
baseline (401 tests, 386 passed, 15 existing failures). Report external
OpenCerts/TradeTrust UI testing separately from local suite compatibility.

## Implemented schema and signing flow

Migration 018 adds:

- `organization_dids`: immutable organization ownership and unique original
  slug/DID path, status (`active`, `inactive`, `suspended`), method, hosting mode,
  cached public DID document, and creation/update timestamps.
- `organization_verification_methods`: organization DID/organization/issuer/key
  references, unique method and key IDs, public Multikey, fingerprint, key
  version, active/inactive state and timestamps.
- Automatic organization DID creation, initial-key binding/publication,
  lifecycle synchronization and atomic managed rotation activation.
- Service-only scoped status allocation/snapshot and audited-download RPCs.
  Authenticated table access is read-only and RLS-scoped; service-role direct
  table access is explicitly reduced to SELECT, including environments with
  permissive default grants. Internal writes use restricted definer functions.

Existing credentials continue to store `organization_id`, `issuer_id`,
`signing_key_id`, `issuer_did` and `verification_method`. The immutable
`issuer_snapshot` adds `didUsed`, method, key ID/version and `keyFingerprint`;
duplicate identity columns are unnecessary. Historical rows and signed bytes
are not rewritten.

New issuance resolves saved template -> authorized active issuer -> active
owned encrypted key -> active managed organization method. Legacy template
profiles may still supply their existing document-store metadata, but cannot
select the signing identity or a deployment secret. Initial keys become active
and public in one database transaction. Rotation remains an explicit two-step
create-pending/activate operation; no scheduler or automatic rotation is added.

The public document includes retained issuer/key-version methods in
`verificationMethod` and `assertionMethod`. Only active methods appear in
`authentication`. Disabled organizations/issuers cannot issue new credentials.
Status publication alone may use retained owned keys to preserve historical
revocation/suspension checks. Root/profile status signers retain their original
controller and choose the newest historical version for that issuer, without
mistaking legitimate version history for cross-issuer identity ambiguity.

Document rebuilds enforce a 900,000-byte budget below the safe resolver's
1 MiB response limit; oversized changes fail transactionally instead of issuing
credentials against an unresolvable document. Managed publication revalidates
on each request (ETag, no stale-cache window) so newly activated methods are not
hidden behind a deliberate five-minute cache.

## APIs and view-only UI

| Method/path | Behavior |
| --- | --- |
| `GET /api/managed-dids?organizationId=<uuid>` | Authenticated own-organization DID metadata and validated public document |
| `GET /api/managed-dids?organizationId=all` | Platform administrator only; paginated internally beyond Supabase row caps |
| `GET /api/managed-dids/methods?organizationId=<uuid>&issuerId=<optional-uuid>` | Authenticated public-method metadata, RLS-filtered to assigned issuers |
| `POST /api/managed-dids/download?organizationId=<uuid>` | Explicit same-origin authenticated download, audited before response |
| `GET /organizations/<original-slug>/did.json` | Public canonical DID document, CORS and ETag, no login redirect |
| `GET /organizations/<original-slug>/status-list/<page>/<purpose>` | Public signed organization-scoped Bitstring Status List |

Public paths rewrite to narrow handlers in the existing consolidated API.
Their DID controller always uses `verifiable.sg`, never Host or forwarded Host.
Unknown/noncanonical paths are rejected. Private endpoints return no-store
responses. GET/HEAD reads do not create download audit events; download POST
requires the existing tenant authorization and same-origin checks.

The workspace navigation now opens `/organization-did/`. The page shows DID,
status/method/hosting mode, historical issuer/method counts, creation date,
assigned verification-method metadata, raw JSON and explicit download. Platform
administrators can select all organization DIDs. The existing `/did/` registry,
root DID/JWKS and credential URLs remain available. Issuer key panels expose
explicit pending-version activation, with updated administrator instructions.

## Compatibility and security review

- Actual installed TrustVC ecdsa-sd-2023 signatures/disclosures verify under a
  shared organization DID with two distinct issuer keys. Assertion-only
  historical methods remain valid even with no authentication methods.
- Managed status lists can be signed by another authorized retained key under
  the same organization DID. Revoked credentials and foreign-organization
  status references fail verification. Legacy root/path-independent checks,
  document-store hashing and Ethereum wallet behavior remain covered.
- OpenCerts-compatible payload contexts and W3C proof/disclosure checks are
  exercised locally. The installed TrustVC/TradeTrust status decoder and
  isolated runtime traces remain compatible. This is not a claim of live
  certification against external OpenCerts/TradeTrust hosted applications.
- DID publication validates an exact public-field allowlist, valid P-256
  compressed Multikey points, controllers, relationships and unique method
  IDs. Ciphertext, private JWK fields and arbitrary extra fields are rejected.
- A scoped final security review found one medium-severity insertion-path
  weakness: accepting a retired `signing_key_id` on a new credential. It was
  fixed: new keyed inserts require an active owned key, active managed method
  and active organization DID. Authenticated-role regression tests first prove
  an active insert succeeds, then reject retired keys, inactive methods/DIDs,
  disabled issuers and disabled organizations. Existing historical rows remain
  readable; retained status-list signing is deliberately separate.
- Production client JavaScript was scanned: no encryption environment names,
  ciphertext storage fields or server private-export implementation were found.
  The previously approved immediate, one-time administrator PEM ZIP exception
  remains unchanged; public DID downloads contain no private material.

## Operator migration and release gates

1. Back up the database and restore a staging copy. Confirm migrations 015-017,
   Phase 3 encrypted-key backfill and master-key/keyring configuration are
   complete. Missing keys must be resolved through the existing Phase 3 process,
   not generated as replacements for historical signers.
2. Preflight organization slugs against `^[a-z0-9][a-z0-9-]{0,62}$` and check for
   any pre-existing custom database grants/triggers. Invalid legacy slugs must
   be explicitly reconciled before rollout; migration 018 fails atomically.
3. Apply migration 018 in staging before enabling the new runtime. It backfills
   one DID per organization, preserves original paths, publishes active/retired
   owned public keys, and activates only genuinely unbound initial keys.
   Pending rotations stay pending. No decryption/master secret is needed by SQL.
4. Deploy the application with the existing server-only encryption keyring and
   status-list feature configuration. The canonical managed origin/path must
   route to this deployment over HTTPS. Keep historical public DID/JWKS keys,
   legacy routes, existing private-key versions and previous encryption keys.
5. Test real Supabase JWT/RLS roles, new organization/issuer provisioning,
   canonical public resolution, per-issuer issuance, rotation, disabled-owner
   signing denial, downloads/audits, historical verification and status changes.
   Perform external OpenCerts/TradeTrust viewer checks with staging credentials.
6. Only after these gates pass, deploy/apply the approved production release.
   No remote migrations, production keys, secrets or deployments were performed
   during this implementation.

## Modified files

- Schema/tests: `database/migrations/018_managed_organization_dids.sql`,
  `database/migrations/018_managed_organization_dids.test.js`.
- Managed identity: `lib/managed-did-urls.ts`, `lib/managed-did.ts`,
  `services/ManagedDIDService.ts`, `services/ManagedDIDService.test.js`.
- Signing/status: `services/IssuerKeyService.ts`,
  `services/IssuerKeyService.test.js`, `services/StatusListService.ts`,
  `services/StatusListService.test.js`, `lib/trustvc.ts`,
  `lib/trustvc.test.js`, `lib/ethereum-transactions.test.js`.
- API/public routing: `app/api/managed-dids/handler.ts`,
  `app/api/[...resource]/route.ts`, `app/api/routes.test.js`,
  `app/api/issue/route.ts`, `app/api/issue/route.test.js`,
  `proxy.ts`, `proxy.test.js`, `next.config.js`,
  `scripts/trace-credential-runtime.test.js`.
- UI: `app/organization-did/page.tsx`, `components/OrganizationDIDPanel.tsx`,
  `components/OrganizationDIDPanel.test.js`, `components/IssuerKeysPanel.tsx`,
  `components/IssuerKeysPanel.test.js`, `lib/navigation.ts`, `app/did/page.tsx`.
- Documentation: this analysis, `docs/PHASE3_KEY_MANAGEMENT_ARCHITECTURE.md`,
  `app/docs/admin-manual/page.tsx`.

## Local validation results

- 76 focused key/DID/issuance/RLS/publication/UI acceptance tests passed. One
  previously failing obsolete issuance mock was explicitly excluded from this
  targeted selector, not removed or weakened; it remains in the full suite.
- Two actual encrypted-key/managed multi-issuer cryptographic interoperability
  tests passed, including signed status, revoked status, disclosure and
  cross-organization rejection checks.
- Three runtime tracing/isolation tests passed, including the consolidated
  managed status publication handler's dynamic crypto dependency trace.
- `npm run build` passed with TypeScript checking.
- Full suite: **419 tests, 404 passed, 15 failed**. The complete set of failing
  top-level and nested test names matches the Phase 3 baseline; no new failing
  names. Existing failures include outdated handler mocks, legacy protected
  JSON-LD/context cases and the existing OpenCerts script loader.
- No live Supabase migration, public DNS/hosting validation or external hosted
  verifier certification was performed; those remain the explicit release gates.
