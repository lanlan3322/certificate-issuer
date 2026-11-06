# Phase 3: Issuer Key Management Architecture

Phase 4 supersedes only initial activation/publication and signer binding:
initial keys are now published and activated transactionally under the managed
organization DID; explicit pending-version activation publishes a new method
while retaining old methods. Legacy bindings/status signers remain available.
See [Managed DID analysis](./PHASE4_MANAGED_DID_ANALYSIS.md).
The encryption, ownership and one-time private-export safeguards below remain.

Status: implemented locally. Production keys, environment secrets and remote
databases have not been modified. Staging/live Supabase rollout remains an
operator release gate.

## Approved scope decisions

- Use **P-256**, not secp256k1, with the existing TrustVC ecdsa-sd-2023 suite.
  The user explicitly approved this compatibility choice.
- Automatically generate encrypted **pending** keys. Activate only against an
  already published, matching assertion method. No new DID publication or
  configuration, DID portal, document stores, billing or subscriptions.
- Permit **one-time authorized private PEM ZIP delivery** immediately after
  creation as the sole private-response exception. No private-key JSON/read API.
- Fix the tenant-controlled deployment-secret-reference vulnerability.

## Current signing architecture

- Phase 2 resolves the saved template's issuer and authorizes issuer operations
  before signing. Organizations, issuer memberships and isolation are retained.
- `lib/trustvc.ts` signs Data Integrity credentials using
  `ecdsa-sd-2023` and `@digitalbazaar/ecdsa-multikey`.
- Existing issuer profiles resolve private/public Multikeys from deployment
  environment variables named by `key_reference`. The legacy path uses the
  global environment signing identity.
- Existing DID resolution and status-list publication depend on published
  verification methods. Historical credentials contain signing identity and
  status references that must continue resolving.
- The installed Multikey implementation supports P-256/P-384/P-521, not
  secp256k1. Its public and secret Multikey parsers reject secp256k1.
  Generating that curve alone would not integrate with the current signer.

Evidence: `lib/trustvc.ts:239`, `lib/trustvc.ts:1470`,
`node_modules/@digitalbazaar/ecdsa-multikey/lib/helpers.js:15`,
`lib/did-publication.ts:42`.

## Security gaps and requirements requiring a decision

1. Profile administrators can currently choose deployment environment variable
   references. A known reference for another issuer can select another issuer's
   signing key. Server-controlled issuer/key ownership must replace tenant
   control of signing-secret references.
2. The requested secp256k1 algorithm is incompatible with the installed
   ecdsa-sd-2023 signing path. Recommend P-256 to preserve that path. A different
   proof stack requires explicit approval and interoperability validation, not
   an undocumented curve substitution.
3. Newly generated keys cannot replace existing DID verification keys without
   matching publication. No global identity fallback is acceptable for new
   issuer-key issuance. Since DID generation/configuration/document management
   is excluded, unbound keys must remain unable to sign externally verifiable
   credentials until a pre-existing, matching verification method is available.
4. A ZIP containing a private PEM necessarily delivers a private key to the
   administrator's client. Treat it as an expressly approved provisioning
   exception, never a normal JSON key-read API. If the no-private-key-response
   rule is absolute, omit private-key downloads.
5. A downloadable key is exportable; the platform cannot prevent its recipient
   from retaining or using it. One-time retrieval limits platform delivery, not
   subsequent copies. Disclose this risk in the provisioning confirmation.

## Storage options

| Option | Benefits | Trade-offs |
| --- | --- | --- |
| A. Application-encrypted database | Fits existing Supabase; transactional ownership/version/audit records; no new paid service | Application compromise plus master-key access exposes keys; privileged application code can decrypt |
| B. External secret store | Centralized secret access/auditing and policy | Additional credentials/infrastructure; exportable keys still enter application memory |
| C. Managed KMS/HSM signing | Strongest isolation when private keys are non-exportable | Provider curve/proof compatibility, signing API integration and cost; non-exportability conflicts with private PEM download |

Recommendation: A is the practical initial implementation under the stated
preference and existing stack, not equivalent to non-exportable KMS protection.
KMS is the stronger long-term isolation model if interoperability and export
requirements change. No external service or spend is provisioned.

## Implemented encryption design

- Server-only AES-256-GCM using a cryptographically random 32-byte master key
  supplied as `ISSUER_KEY_ENCRYPTION_KEY`; reject invalid or missing configuration.
  Never invent a default, persist it in source, or expose it through public env.
- Fresh random 96-bit nonce for every encryption; 128-bit authentication tag.
  Store a versioned ciphertext envelope, not plaintext private PEM or JWK.
- Authenticate issuer ID, organization ID, algorithm, signing-key version and
  encryption-key identifier as additional authenticated data. This prevents
  ciphertext substitution between tenants and versions.
- Keep signing-key version separate from encryption-key version. Define the
  old-master-key lookup and operational rewrapping process explicitly before
  enabling master-key changes; do not make old keys undecryptable by overwriting
  the only master key.
- Use server-side crypto and the repository's existing ZIP tooling. Keep private
  key material in memory only for signing or approved export, never logs/errors,
  client bundles, React props, analytics, caches or audit metadata. Best-effort
  buffer clearing does not guarantee erasure in a garbage-collected runtime.

## Implemented database and API foundation

`issuer_keys`: ID, issuer ID, public key, encrypted private key envelope,
fingerprint, algorithm, signing-key version, encryption-key identifier, status,
created/rotated timestamps, and one-time-export claim state.

- Unique `(issuer_id, key_version)` and at most one active key per issuer;
  history is retained. One active pair is distinct from one row for all time.
- No authenticated or anonymous direct reads of ciphertext. Server-only service
  access is authorized against the real issuer on every operation.
- Separate safe metadata projections from internal ciphertext queries. Never
  serialize raw database rows into administrative responses.
- Use SHA-256 over canonical DER SubjectPublicKeyInfo for fingerprints; export
  public SPKI PEM and, if approved, private PKCS#8 PEM.
- Provision issuer, key and generation audit atomically. Invitation and legacy
  creation paths must use the same provisioning invariant. Do not retain an
  issuer that reports successful provisioning when key persistence failed.
- Restrict initial export and manual rotation to platform/organization admins
  with issuer-management scope. Issuer members can see safe public metadata,
  never ciphertext, private keys or rotation controls.
- The approved download exception would use an explicit immediate-creation
  action, short expiry, reauthorization, one-time atomic claim and no-store
  headers. Only one concurrent request can win. A lost response cannot be
  guaranteed delivered exactly once; no repeated private-key retrieval.
- Audit generation, successful export claim and rotation with actor, tenant,
  issuer, key version, timestamp and available request IP; never key material.

## Issuance and rotation

Automatic signer selection becomes template -> issuer -> active owned key.
No tenant-selected secret reference or cross-issuer/global fallback remains.
Require compatible existing controller/verification method bindings before
activation. Public key publication and status-list signing must remain
consistent with credential signing.

Manual rotation can create a pending version and retain history. Do not
activate a version or deactivate the old signer until matching public
verification material is resolvable. Do not start automatic rotation. Historical
public verification methods/status documents must remain available, including
after issuer deactivation or signing-key rotation.

## Migration strategy

1. The compatibility, pending-activation and private-export decisions above
   were resolved before implementation.
2. Back up and restore staging; inventory issuer/profile/key references without
   logging or exporting secret values. Detect issuers with multiple existing
   profile signing identities rather than arbitrarily selecting one.
3. Add encrypted storage and restricted metadata/ownership invariants in an
   additive migration. Existing environment keys require a server-side import
   using deployment secrets, not plaintext SQL literals or browser input.
4. Preserve old key material/verification methods and credential identity.
   Never rewrite signed credentials, reissue them, or associate a newly
   generated key with a historical signature it did not create.
5. The default issuer must import the actual legacy signer; creating a new
   random default key cannot verify historical signatures. Ambiguous profile
   bindings need explicit migration resolution.
6. Deploy only after restored-database, live Supabase authorization and
   cryptographic interoperability acceptance. Do not apply a remote migration,
   configure a DID, rotate a production signer or create secrets implicitly.

## Validation plan

Test AES-GCM round trips, tampering, nonce uniqueness, authenticated ownership,
wrong/missing masters, canonical fingerprints, issuer/key atomicity, unique
active versions, safe serialization and log redaction. Race-test single-use
download claims and expiry, including delivery failure behavior.

Test issuer-scoped signing and all role/tenant restrictions, creation and
invitation paths, status-list signer consistency, manual pending rotation and
historical verification with unchanged signed documents. Run focused tests,
the complete repository suite and `npm run build`; separate existing failures.

## Schema and authorization

Migration `017_issuer_key_management.sql` requires migrations 015 and 016.
It adds:

- `issuer_keys`: public SPKI PEM and Multikey, authenticated encrypted PKCS#8,
  SHA-256 SPKI fingerprint, P-256 algorithm, signing-key version, master-key ID,
  pending/active/retired status, immutable controller/method bindings, timestamps,
  creator and short-lived export/claim state.
- Unique issuer/version, one active key and one pending key per issuer.
- Nullable `credentials.signing_key_id`; new server issuance persists the actual
  key ID/version/fingerprint in its immutable issuer snapshot, including an
  in-flight signature completed during rotation. Existing signed bytes and
  legacy records are unchanged.
- Deferred issuer/key provisioning invariant, atomic issuer/invitation/key RPCs,
  creator attribution and append-only key/audit history.
- Service-only import/rewrap/activation/export RPCs. Anonymous and authenticated
  users have no direct table access; ciphertext is never in safe projections.
- Removal of authenticated direct issuer insertion and the old unkeyed
  invitation reservation grant. Every newly created issuer must have a key
  at transaction commit.
- Immutable profile secret references and server-controlled issuer fingerprints.
  Legacy profile creation now returns 409; the existing identity page retains
  metadata/status editing but removes secret-reference and new-identity forms.

| API | Access and behavior |
| --- | --- |
| `GET /api/issuers/:id/keys` | Reauthorize actual issuer; members receive fingerprints only; platform/own-organization admins receive safe public metadata and export availability |
| `POST /api/issuers/:id/keys` `{action:"rotate"}` | Issuer-management scope plus active organization/issuer; create next pending version, never disable current signer |
| Same route `{action:"activate",keyId}` | Match exactly one existing owner identity and its published Multikey assertion method; require historical public methods remain resolvable |
| `POST /api/issuers/:id/keys/download` | Same-origin, creator-only first-version export, at most once within 10 minutes; ZIP attachment, no-store, no GET/HEAD |

All key responses, including errors, are no-store. Mutations require the actual
same-origin Origin header. Initial exports for imported legacy keys and all
rotated versions are disabled. The UI confirms export risk and expiration,
uses an opaque Blob, revokes its object URL and prevents retries after an
attempt with uncertain delivery.

Activation uses the existing public-DNS-pinned HTTPS loader (SSRF restrictions,
bounded response/redirects and timeout), checks DID/controller/Multikey and
assertion authorization, and preserves old public methods. Rotation cannot
change its historical status-list controller or individually activate a shared
legacy identity. Shared legacy identities need a coordinated future identity
migration; until then the old active signer remains available. No automatic
rotation is scheduled.

Issuance and status-list publication now resolve encrypted, issuer-owned active
keys. They never use a global or profile-selected environment-secret fallback.
Legacy standalone TrustVC helpers remain for compatibility/testing, but are not
used by these runtime signing routes. The old profile-reference resolver fails
closed. Signing errors log stable codes, not third-party errors or key objects.

## Operator rollout

1. Back up the database and recoverably back up the existing signing secrets.
   Restore staging and run the live RLS/role acceptance there first.
2. Provision `ISSUER_KEY_ENCRYPTION_KEY` using the deployment secret manager:
   canonical base64 for 32 random bytes. Set `ISSUER_KEY_ENCRYPTION_KEY_ID=v1`.
   Do not use a public environment prefix or write populated secrets into Git.
   A lost master plus lost backup makes encrypted keys unrecoverable.
3. Configure the operator's **application user UUID** in
   `ISSUER_KEY_MIGRATION_ACTOR_ID`; it must be a platform administrator, not just
   a Supabase auth UUID. For legacy profiles, explicitly approve existing
   secret-reference names in the JSON string array
   `ISSUER_LEGACY_PROFILE_KEY_REFERENCES`. This allowlist is operator-only and
   never accepts references from tenant/API input.
4. In a coordinated maintenance rollout, apply migration 017 to staging.
   Use the deployment's existing secrets and run:

   ```sh
   node --env-file=/secure/operator.env scripts/migrate-issuer-keys.js
   node --env-file=/secure/operator.env scripts/migrate-issuer-keys.js --apply
   ```

   The first command is read-only preflight. The second imports all planned
   keys in **one transaction**. It imports the actual default legacy signer,
   not a generated substitute. Completely unused issuers with no configured
   identity or historical credentials instead receive independent pending keys,
   without an export opportunity. Re-running skips issuers that already have keys.
   Private values are never printed or written to temporary files.
5. The inventory paginates beyond Supabase's row cap. Missing/incompatible
   signers for historical/configured identities, mismatched key pairs,
   conflicting shared controllers, multiple issuer identities and historical
   binding inconsistencies stop preflight before any writes. Resolve these
   explicitly; never arbitrarily choose a key. Legacy deployments sharing the
   old global signer retain its fingerprint under each original issuer with
   separately bound encryption. New issuers always get independent keys.
6. Deploy the application only after all existing issuers are imported and
   staging issuance/status-list/verification succeed. Apply the same controlled
   sequence in production. Never deploy the encrypted-only signer before its
   key backfill; missing/pending keys deliberately fail closed.
7. Leave historical public DID documents/keys and status-list routes intact.
   This phase does not publish generated public keys or reissue credentials.

### Master encryption-key rotation

Signing-key versions are independent of encryption master IDs.

1. Put the new master under a **new ID**, retaining every older master in
   `ISSUER_KEY_ENCRYPTION_PREVIOUS_KEYS` as a JSON object of ID -> base64 value.
   Deploy the full keyring consistently to every server instance before
   allowing writes with the new current ID.
2. Run the operator script with `--rewrap` for read-only validation, then
   `--rewrap --apply`. It authenticates every old ciphertext, verifies public
   fingerprints, and transactionally replaces envelopes using compare-and-swap
   checks. It does not change signing versions, public keys or export history.
3. Verify reads/signing and inspect `key.rewrapped` audits. Keep old masters
   until all instances, retained backups and disaster-recovery requirements
   are satisfied. Never change a master value while reusing its ID.

## Files changed

- `lib/issuer-key-crypto.ts`, `lib/issuer-input.ts`, `lib/trustvc.ts`.
- `services/IssuerKeyService.ts`, `services/IssuerKeyMigrationService.ts`,
  `services/IssuerService.ts`, `services/IssuerProfileService.ts`,
  `services/CredentialService.ts`, `services/StatusListService.ts`.
- `database/migrations/017_issuer_key_management.sql`,
  `scripts/migrate-issuer-keys.js`, `.env.example`.
- Key metadata/download handlers, consolidated API router, issuer creation,
  issuer-profile handler and issuance route under `app/api/`.
- `components/IssuerKeysPanel.tsx`, `app/admin/page.tsx`, `app/did/page.tsx`,
  `app/docs/admin-manual/page.tsx`.
- Focused crypto, SQL/RLS, service, API, UI and interoperability tests; existing
  mock contracts updated for issuer-owned signer resolution and reference denial.
- This architecture/operator review.

## Residual security considerations

Encrypted DB storage protects database-only compromise, not simultaneous
application/service-role/master compromise. Privileged code can decrypt;
this is not non-exportable KMS/HSM signing. Export recipients can retain copies.
JavaScript strings and native key objects cannot be guaranteed erased even
though plaintext buffers are cleared best-effort. Export claims are at-most-once,
not exactly-once delivery: an interrupted response cannot be downloaded again.
No application API can prevent an external operator from later removing a
published historical key; preservation remains a release/operational invariant.

## Validation results

- Production build and TypeScript check: `npm run build` passed.
- Focused key/issuer/API/UI/persistence acceptance: 69/69 passed.
- Actual encrypted-key TrustVC issuance, selective disclosure and verification:
  1/1 passed with the global private signing environment variable removed.
- Full repository suite: 401 tests, 386 passed, 15 failed. The failing names
  match the pre-change baseline; no new failing names were introduced.
- Scoped security review found no remaining vulnerabilities. The original
  tenant-selected secret-reference finding is fixed.
- Client production bundles contain no issuer encryption configuration,
  ciphertext storage fields or private-export implementation.
- Live Supabase migration/RLS acceptance and production identity activation
  remain unperformed operator release gates; local SQL behavior was exercised
  against PGlite. No real master secret, production key or remote migration
  was created.
