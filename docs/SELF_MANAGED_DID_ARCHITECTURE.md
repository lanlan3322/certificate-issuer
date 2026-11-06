# Self-managed DID hosting

## Architecture

Extends the managed identity foundation without replacing organization identities,
issuer keys or historical credential bytes. An organization retains its immutable
managed DID and may configure one additional immutable root `did:web:<domain>`.
This is customer **hosting**, not customer custody: existing AES-GCM encrypted
issuer-owned P-256 keys remain server-side.

Administrators explicitly select the identity used for **new** issuance. Configuring
a domain alone does not switch issuance. Switching to self-managed requires live
validation of both public files; every subsequent credential signer checks again.
If deployment becomes stale, inaccessible or expired, issuance fails explicitly.
There is no silent managed fallback. Switching back does not remove customer
identity history or change existing credentials.

Public issuer methods are derived from the managed document, with customer DID
controllers and the same issuer/key-version fragments and public Multikeys.
Active methods appear in authentication; retired methods remain authorized for
historical assertions. Deactivating an issuer prevents new signing, not verification.

## Public deployment files

- `https://<domain>/.well-known/did.json`: DID Core public document containing all
  retained issuer methods, authentication and assertion relationships.
- `https://<domain>/.well-known/did-configuration.json`: DIF well-known DID
  configuration containing a real ES256-signed DomainLinkageCredential JWT.
  The credential binds the exact HTTPS origin to the customer DID and an owned,
  authorized issuer method. The signed claim expires after 365 days; downloads
  renew missing/invalid linkage or linkage within one day of expiry.

Files contain no private or encrypted private keys. Both are downloaded through
explicit audited administrator actions. Publish the exact generated files, with
valid TLS, HTTP 200 and JSON responses; redirects are rejected. Enable CORS for
browser verifiers. Current validation proves **server-side** accessibility and
signature/content correctness, not external browser CORS or viewer certification.

The domain is immutable and globally unique, including before activation. Choose
it carefully: this release does not implement domain release, renaming or multiple
customer domains. Existing legacy issuer-profile domains cannot be claimed.

## Schema and consistency

Apply migration `019_self_managed_dids.sql` after `018_managed_organization_dids.sql`.
The new `self_managed_dids` row is unique per organization and domain. It records
the derived DID, selected preference, expected public document, signed public
linkage/expiry, revision, validation result/revision, timestamps and creator.

RLS permits own-organization reads and platform administration. Direct writes are
revoked even from service role. The service-only `phase5_did_action` RPC rechecks
actual platform/organization administration, locks identity/configuration in the
existing order, checks revisions and writes audit events. Authenticated users
cannot invoke it directly.

Managed document updates rebuild the expected customer document transactionally,
increment revision and mark validation stale. Regenerated linkage also increments
revision. Validation/download/selection commits require the same revision, so a
concurrent update cannot validate or select an obsolete generated deployment.
The credential insert trigger enforces the selected DID, active owned issuer key,
verification method, current validated revision and unexpired linkage.

Audit actions cover configuration, linkage generation, validation success/failure,
mode selection, downloads and deployment-stale events. No customer response body,
private key or ciphertext is included in audit metadata.

## APIs and portal

`GET /api/self-managed-dids?organizationId=<uuid>` returns authorized public
configuration; platform administrators may select another organization.
`POST` supports `configure`, `files`, `validate`, `self-managed` and `managed`.
Mutations require same-origin requests and administrator access, have a 2 KiB body
limit, and validation/activation are rate-limited per organization. Tenant/member
checks remain enforced by the API, authenticated database reads and management RPC.

The DID Management page includes overview, public file downloads, validation state,
issuer methods and raw generated document. Issuers/viewers have read-only access;
organization administrators manage only their organization, platform administrators
may select any organization.

## Status and backward compatibility

Customer credentials use customer DID proofs, but signed Bitstring Status List
credentials remain served at:

`https://verifiable.sg/organizations/<retained-managed-slug>/self-managed/status-list/<page>/<purpose>`

The public route resolves the customer DID from stored organization configuration,
never request Host or arbitrary caller input. Status credentials must be signed
under the same DID as the credential. Verification checks the fixed platform
origin, full shared organization/page path, proof, purpose, index and freshness.
Customer historical status signing uses a retained owned method still published
by the customer, without requiring current selection or unexpired domain linkage.
Owned mapping history is paginated, so old published keys remain usable.

Managed and legacy DID documents/status URLs and credential bytes remain unchanged.
Local real-crypto tests exercise multiple issuer signatures, selective disclosure,
retired methods and customer-DID-signed platform status credentials. This retains
the installed TrustVC/W3C proof format; it is not a claim of independent OpenCerts,
TradeTrust or third-party viewer certification.

## Security boundaries and rollout

The safe document loader requires public DNS results, rejects IP/private/reserved
destinations and all redirects for deployment proof, pins validated DNS addresses
while retaining TLS hostname checks, caps responses at 1 MiB and bounds DNS lookup
and each HTTPS request at five seconds. Strict document allowlists reject unknown
or secret-bearing fields, foreign controllers and malformed P-256 keys. Linkage
checks exact domain/issuer/subject, authorization, timestamps and ES256 signature.

No new dependency, secret or environment variable is required beyond Phase 3.
No remote migration or customer deployment is performed by this change:

1. Back up the database and rehearse migration 019 on staging after migration 018.
2. Deploy schema before runtime; existing organizations remain managed by default.
3. Configure an administrator-controlled domain, deploy both generated files and
   validate. Check CORS and target external viewers separately.
4. Explicitly activate customer DID issuance; issue and verify a staging credential,
   revoke/suspend it and verify status resolution from the public platform URL.
5. Test key activation, republish/revalidation and explicit managed-mode rollback.

Historical verification depends on long-term customer domain/TLS availability and
retention of public methods. The platform cannot guarantee external domain renewal,
DNS integrity, CORS or customer hosting uptime. Keep files online even after
switching back, issuer deactivation or organization suspension.

## Changed surfaces

- Schema and transaction/RLS tests:
  [migration 019](../database/migrations/019_self_managed_dids.sql), its tests, and
  the shared migration-018/019 fixture.
- Public DID generation, signed domain linkage and deployment validation:
  [self-managed DID helpers](../lib/self-managed-did.ts) and tests;
  [safe loader](../lib/safe-document-loader.ts) and tests.
- Portal APIs and service:
  [handler](../app/api/self-managed-dids/handler.ts),
  [service](../services/SelfManagedDIDService.ts), service/API tests and consolidated
  API registration/test.
- Identity selection and historical signing:
  [ManagedDIDService](../services/ManagedDIDService.ts),
  [IssuerKeyService](../services/IssuerKeyService.ts), and their tests.
- Public status publication and proof verification:
  [StatusListService](../services/StatusListService.ts),
  [managed/public handlers](../app/api/managed-dids/handler.ts),
  [verifier](../lib/trustvc.ts), [proxy](../proxy.ts), and their tests.
- UI and documentation:
  [SelfManagedDIDPanel](../components/SelfManagedDIDPanel.tsx) and tests,
  [OrganizationDIDPanel](../components/OrganizationDIDPanel.tsx) and isolated tests,
  [DID Management page](../app/organization-did/page.tsx),
  [navigation](../lib/navigation.ts), [admin manual](../app/docs/admin-manual/page.tsx)
  and the [Phase 4 report](PHASE4_MANAGED_DID_ANALYSIS.md) scope clarification.

## Local verification

- Production build and type-check pass.
- 48 focused portal/API/service/SQL/public-loader tests pass, plus actual managed,
  legacy-key and customer multi-issuer crypto interoperability tests and selected
  status-service integration tests.
- Full suite: 439 tests, 424 pass, 15 fail. All 15 failing test names are identical
  to the recorded Phase 4 baseline; no new failing names were introduced.
- Browser bundle scan: no private-key infrastructure matches in 42 production
  JavaScript files.
- Scoped security review: no confirmed vulnerabilities found. Production-like
  migration rehearsal and actual customer HTTPS/external-viewer checks remain
  deployment gates, not completed live validations.

References: [DID Core](https://www.w3.org/TR/did-core/),
[did:web](https://w3c-ccg.github.io/did-method-web/),
[DIF DID Configuration](https://identity.foundation/well-known-did-configuration/resources/did-configuration/).
