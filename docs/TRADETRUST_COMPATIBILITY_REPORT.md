# TradeTrust compatibility report

Updated: 2026-10-20
Overall: **Supported W3C issuance profile implemented; synthetic hosted upload
passes format recognition; full hosted verification of a newly issued credential
remains unverified**

## Supported TrustVC issuance profile — 2026-10-20

### Vercel registration configuration

**Updated behavior:** selecting Ethereum explicitly requests Document Store
registration, regardless of `ENABLE_DOCUMENT_STORE_REGISTRATION`. That flag
controls automatic registration only; it cannot suppress an explicit Ethereum
selection. The request is handled after the issuance response, with submitted
transaction hash and final outcome in the existing audit log. A funded server
signer with issuer permission and a working RPC are still required. Missing
configuration produces a registration failure, never a successful registration.
The certificate remains issued if the blockchain attempt fails.

The disabled response described below applies to deployments predating this
change. Deploy the updated code to activate selection-driven registration.

If issuance returns `blockchainRegistration: "disabled"`, the active server has
not enabled optional registration. Local environment settings do not configure
Vercel. In the Vercel project's environment settings, select Production (and
Preview if needed), configure the following, then redeploy:

- `ENABLE_DOCUMENT_STORE_REGISTRATION=true`
- `DOCUMENT_STORE_ADDRESS=0x814D9c222D3b5A8282e0467Fa12b24C057731dD6`
- `SEPOLIA_RPC_URL` through the deployment's secret configuration
- `DOCUMENT_STORE_PRIVATE_KEY` through the deployment's secret configuration
  (or `SEPOLIA_DEPLOYER_PRIVATE_KEY`, supported on Sepolia)

Never prefix keys or private RPC endpoints with `NEXT_PUBLIC_`. Use a funded,
authorized issuer signer, not an exposed admin key. Issuer-profile store overrides
still take precedence. Changing the flag does not retroactively register previously
skipped certificates. Check registration-submitted/registered/failed audit events
after a fresh issuance; a scheduled response alone is not blockchain confirmation.

The UI now labels this case "Certificate issued — blockchain registration skipped"
as a warning, not "Ethereum Issuance Failed". No transaction was attempted in the
disabled case. DID+Ethereum submission also no longer requires a connected browser
wallet; wallet-only issuance still does.

The user approved a W3C status-list profile with optional blockchain registration
kept separately. Single and batch DID issuance now request `statusProfile: "trustvc"`.
The authenticated issuance endpoint requires persistence, allocates durable
`BitstringStatusListEntry` status, and signs the credential with DID-only issuance
semantics. Original selected issuance methods remain in platform metadata.

When Ethereum is also selected, the platform hashes the signed document and saves
the hash in `credentials.document_hash`. Optional post-response registration uses
the selected issuer's store and existing transaction audit events. A scheduled
response is not confirmation of registration. The external verifier checks signed
status lists, not this separate anchor; revocation uses the atomic status-list
update without depending on the optional anchor. Historical signed-hash
revocation and wallet-only issuance retain their existing paths.

Prerequisites: enable `ENABLE_BITSTRING_STATUS_LIST`, apply the existing status-list
database migrations, and publish signed lists on an HTTPS issuer-controlled origin
matching the DID. The legacy issuer also needs `STATUS_LIST_BASE_URL`.
Missing configuration fails explicitly; there is no fallback to the incompatible
application-specific status. No new database migration is required.

Opened the actual `https://trustvc.io/` portal and uploaded only a non-personal
synthetic credential signed using a newly generated ephemeral key. Its DID and
status-list URLs deliberately used `compatibility-test.invalid`. The portal
accepted the JSON format and attempted DID/list retrieval rather than displaying
"Document is invalid". DNS resolution failed as expected, and the final UI said
"Document has been tampered with". This proves upload recognition only, NOT a
successful cryptographic or status verification. No recipient document was
uploaded, no production key was used, and no new blockchain transaction was sent.

Full acceptance still requires deployment, a freshly persisted certificate from
the authenticated issuance UI, reachable authorized DID/signed-list endpoints,
and successful hosted verification. Existing downloaded certificates are immutable
and must be reissued for this profile; changing their status fields invalidates
their signatures. No hosted TradeTrust success is claimed.

Validation: 59 focused regressions and the webpack production build/TypeScript
pass. Local availability checks show status lists disabled and no status-list
origin or Supabase URL/service-role configuration. A true persisted end-to-end
issuance cannot run in this local environment; hosted settings were not inspected.

## Exact latest download checked locally — 2026-10-20

The user-directed newest Downloads certificate (09:00:47 UTC) has a valid
ecdsa-sd-2023 signature, authorized published issuer method, registered signed
targetHash and no on-chain revocation. Exact unmodified document verification
passes after replacing the failing default Sepolia RPC with
`https://ethereum-sepolia-rpc.publicnode.com`. The private configured endpoint
also confirms its store state. The earlier 08:48:46 UTC download has an
unregistered signed hash and correctly remains invalid. No recipient JSON was
uploaded or modified.

Installed TrustVC W3C SDK derivation and cryptographic verification pass.
Executed the upstream status fragment pinned at
`25007968939db4c40231fcfea8b426e33892e6d9` on both original and derived newest
documents after crypto initialization: selection returns false and skip reports
`DOCUMENT_STATUS / SKIPPED / Document does not have a valid credentialStatus or type.`
That fragment accepts only `BitstringStatusListEntry` and `StatusList2021Entry`,
not this document's `OpenAttestationDocumentStore`. Thus application verification
does not establish external format acceptance. The user's hosted TrustVC failure
is consistent with an unsupported profile, but its exact upload gate/version and
aggregate output were not independently observed. Installed aggregate
`@trustvc/trustvc@0.0.0` is empty and cannot supply that missing aggregate test.

Recommended next compatibility work: choose a supported W3C status-list export
or a genuine OpenAttestation export. Either must preserve signature/status
integrity and be regression-tested as a separate issuance profile. Do not strip
or rename status fields on already signed certificates.

## Application Document Store verifier update — 2026-10-20

The application now verifies its signed `OpenAttestationDocumentStore` status
entry after successful ECDSA signature/issuer authorization checks. It queries
the signed targetHash/address on the selected supported network and fails closed
for missing registration, revocation, invalid references and RPC failure.
Unqualified historical references retain their original Sepolia semantics.

Dual DID/Ethereum issuance now anchors the same signed credential returned for
download, instead of generating an unrelated wallet credential for registration.
This fixes an application hash mismatch; it does not retrofit historical
registrations or create an OpenAttestation wrapper. External TrustVC support for
this application-specific status type and hosted TradeTrust acceptance remain
unverified. Bitstring and existing cryptographic/wallet regression paths remain
covered separately.

## Dedicated store integration and live service smoke — 2026-10-20

Local issuance now selects `DOCUMENT_STORE_ADDRESS` for unmapped templates while
preserving mapped issuer-profile stores. The signed targetHash is saved in the
credential row. Registration runs via Next.js `after()` without delaying/failing
the issuance response. Submitted txHash and final registration outcome are
recorded through the existing audit log; no schema migration was introduced.
The existing AuditService logs write errors, so database availability is still a
separate acceptance gate. Lifecycle-managed work has a bounded confirmation wait,
not a durable retry worker.

Using the real service and restored authorized signer, a synthetic hash
`0xf38bd46595f00e668ccd324a3857ba9cad0a0e4ba0a9c0712f25cbfd7f52b130`
was registered in the dedicated store by transaction
`0xa8560857d4a47784aa9c53b587ba72d4f6cfca11ab86a5dd6fed8c23cdf5f87a`
(block 11953781, successful receipt). Read-back confirmed `isIssued=true` and a
repeat skipped broadcasting. This proves the configured service can register a
hash; it does **not** prove that a fresh credential verifies in TradeTrust.
No credential or database audit row was created by this smoke.

The local environment lacks Supabase configuration, and the browser is at issuer
login, so fresh authenticated issuance/download, real txHash persistence, viewing,
verification and `ref.tradetrust.io` upload remain **not performed**. Hosted runtime
configuration and application deployment are also pending. Standard legacy
`OpenAttestationDocumentStore` status entries remain application-specific: adding
an on-chain registration does not convert them into supported TrustVC W3C status
entries or an OpenAttestation wrapper. Bitstring issuances without a targetHash
remain on their existing status-list path.

Production build/TypeScript and 18 focused tests pass. Full Node discovery:
119/121 pass after restoring existing SDK patches; unrelated failures remain in
the overview card-count test and direct execution of the OpenCerts TypeScript
script's extensionless import. Final build used `npm run build -- --webpack`;
secret-value scanning of its output and the tracked diff passed. No auth or DID
implementation changes were made.

## Dedicated Document Store deployed — 2026-10-20

The dedicated Sepolia store is now deployed at
`0x814D9c222D3b5A8282e0467Fa12b24C057731dD6` by transaction
`0xbcdab3e41b4c31a943e7586f911e6b49daa115863d39164dcd8cc752da034fbb`.
Receipt status 1, block 11953698; deployed clone code and contract name were
verified. The requested admin has admin, issuer and revoker roles. Deployment
used the standard factory-clone flow with an in-memory signer after simulation,
an exact implementation bytecode comparison, and 44 passing contract tests.

This supersedes the deployment-access blocker recorded below, not the historical
viewer/status results. Subsequent local configuration and synthetic registration
are documented above; fresh credential and portal acceptance remain pending.

## Dedicated Document Store deployment gate — 2026-10-20

Historical pre-deployment gate, superseded by the deployment and integration
updates above.

Deployment source was audited at `TrustVC/Document-Store`
`51f408f45400dd6c124214ffd7f19d5bb7c6c887`. The configured Sepolia factory and
implementations have code; factory address-computation and DS interface probes
respond. Script construction requires both distinct salt entropies and a deployer
address, while the npm wrapper expects Infura configuration and an interactive
signing key rather than the requested named secrets.

No deployment was broadcast: OpenClaw confirms both secret names exist but its
supported store CLI makes secret-kind entries write-only. An approved runtime
secret-injection/signing mechanism is required. No dedicated address or deployment
txHash is available, so fresh certificate issuance, registration, download and
`ref.tradetrust.io` testing have **not been performed for this change**.
Existing DID/CORS observations and earlier status-decoder results below are
historical evidence, not a validation of a new Document Store.

Application inspection also found that registration is fire-and-forget and its
txHash is discarded. Durable completion/transaction persistence and permission
checks for the runtime issuer signer remain integration blockers. See
`AUDIT_PROGRESS.md` for the deployment audit and required next gates.

## Embedded renderer opt-in — 2026-10-14

New DID issuances may opt in to a signed W3C `renderMethod`
(`EMBEDDED_RENDERER`, `id` `https://www.verifiable.sg/renderer/`, `templateName` from
the local template registry). The static renderer page implements the
embedded-renderer frame protocol and passed a local penpal host smoke test.
`/renderMethod` is mandatory in the selective-disclosure proof; tampering fails.
Hosted rendering is **unverified until deployed and tested with a fresh opt-in
certificate**. Existing certificates have no renderMethod and are unchanged.
The Step 19 status decoder ERROR is unaffected by this change.

## Fresh artifact upstream execution — 2026-10-14 16:16 +08:00

Executed the pinned TrustVC reference
[`25007968939db4c40231fcfea8b426e33892e6d9`](https://github.com/TrustVC/trustvc/commit/25007968939db4c40231fcfea8b426e33892e6d9)
fragment code on unchanged `certificate-Laurence9.json` with real installed
dependencies, live DID/status resolution and Node 24.9.0:

| Fragment | Selected | Result |
|---|---|---|
| EcdsaW3CSignatureIntegrity | Yes | VALID after derivation |
| W3CIssuerIdentity | Yes | VALID |
| W3CCredentialStatus | Yes | ERROR: Invalid encodedList: encodedList cannot be decoded (both entries) |

The installed `@trustvc/w3c-credential-status@2.5.0` decoder directly
base64url-decodes the W3C-required Multibase `u` prefix instead of consuming
it first. Both original live lists reproduce gzip `incorrect header check`.
Unsigned diagnostic subject copies without the prefix decode and show bit 3
false; this isolates encoding handling, not proof verification of altered lists.

**Update (Step 23):** status lists are now published as bare base64url, the
form TrustVC 2.5.0 decodes; the app verifier accepts both forms. Hosted
re-check pending deployment.


**Fresh reference compatibility is blocked**, despite application verification
PASS. Preserve standards-compliant signed output; remedy requires a
Multibase-aware external consumer/version. Patching our dependency alone would
not repair a separately hosted verifier. No aggregate builder or hosted portal
execution claimed; exact hosted versions remain unknown. Missing renderMethod
is a separate rendering gap, not the cause of this status error. No recipient
JSON transmitted and original artifact bytes/object unchanged.

## Production application acceptance update — 2026-10-14 15:55 +08:00

Subsequently inspected production download `certificate-Laurence9.json`
(SHA-256 `1aca57166136b617ba26e691d7d589c561eec8ef80d8dea5c97ec1ed44f2be25`).
Actual application verification with live DID/status resolution **PASS**; separate
installed W3C SDK cryptographic verification **PASS**. Authorized
`#ecdsa-2026-01` proof and both active status-list entries at index 3 verified.
No credential contents uploaded. Fresh TradeTrust overall remains **PARTIAL**:
aggregate/hosted execution not performed and `/renderMethod` absent. This
artifact has only VerifiableCredential top-level type, not OpenCerts markers.
No mandatory OA targetHash/store requirement imposed on this W3C profile.

User reports deployment and issue/verify/view all working after sequential
dependency patch repair. The fresh credential was subsequently inspected and
verified as above; this is not hosted TradeTrust acceptance. Earlier historical
artifact FAIL remains. The latest upstream fragment result supersedes the
initial PARTIAL/unverified reference result. No hosted recipient upload.

## Step 12 local opt-in status profile — 2026-10-14

Approved opt-in DID-only profile now issues two BitstringStatusListEntry values
with durable indices and publishes signed VC v2 revocation/suspension lists.
Actual application cryptographic verification and signed status lifecycle PASS
locally; **31 tests PASS**, production build/TypeScript PASS. PostgreSQL migration
functions executed in a disposable embedded engine; production migration,
feature/signing activation and live issue/verify/view have not been performed.

Exact W3C wire requirements checked: 131072 bits, leftmost-bit index zero,
gzip, Multibase base64url `u`, 60-second expiry/TTL. Decoding is bounded.
The installed status SDK emits bare base64url; the wrapper supplies the required
prefix. External verifier consumption of the resulting lists is still untested.

**TradeTrust overall remains PARTIAL/unverified for the new profile; supplied
historical artifacts remain FAIL.** External renderer selection and exact
upstream/hosted acceptance remain blockers. The unchanged default
OpenAttestationDocumentStore status still returns unsupported, not PASS.
This W3C profile has no OA Merkle proof/document-store linkage requirement and
does not establish compatibility with OA v2/v3-only verification.

## Step 11 local ECDSA application verification — 2026-10-14

Actual application entry point now verifies base/derived ecdsa-sd-2023 proofs
using the installed W3C SDK and resolved issuer assertion authorization, avoiding
the empty aggregate exports and hardcoded signing loader for this suite.
Tampering/unauthorized methods/invalid validity fail; wallet behavior preserved.
Nonempty status is explicitly unsupported and returns invalid, not a fabricated
full verification PASS. Current builder status still blocks end-to-end acceptance.
**24 tests PASS**, build/TypeScript **PASS**; no deployment or signing activation.

## Step 10 application verification gate — 2026-10-14

UI deployment success confirmed for `26b61bf2`. Actual local application DID
verification still depends on unavailable aggregate exports and a loader that
hardcodes the historical method. Direct SDK verification tests do not cover that
branch. No corresponding live failure claimed; production exports remain
uninspected. Signing activation blocked until actual application-entry-point
tests establish distinct-method verification and explicit status outcomes.

## Step 9 UI fix pushed — 2026-10-14

UI proof-preservation fix/test approved and pushed in `26b61bf2`; Vercel deployment
pending. Eighteen targeted tests and local build/TypeScript PASS. Signing key is
not activated; authenticated production issuance/verification remain unrun.
Remaining API/tooling fixes are not in this commit. Public authorization PASS
does not resolve distinct-method local-loader, status or renderer acceptance.

## Step 8 live authorization — 2026-10-14 12:06 +08:00

Vercel deployment success independently confirmed. Live DID/JWKS return 200 and
match retained candidates byte for byte. The new method is publicly assertion-
authorized; live P-256 JWK and Multikey correspondence PASS. No private key access
or signing activation. Runtime proof-preservation fixes remain undeployed;
fresh production and external verification remain unrun. Historical artifact
FAIL and status/rendering blockers are unchanged.

## Step 7 public-only deployment pending — 2026-10-14

Approved static DID/JWKS commit `7963ae63` pushed to main. Vercel deployment
status is pending; initial live URLs still lack the new key. Signing activation
is blocked until public authorization is confirmed. Local runtime fixes were
not committed/pushed and must not be described as deployed. External acceptance
and supplied artifact FAIL results remain unchanged.

## Step 6 local public integration — 2026-10-14

Repository static DID/JWKS now exactly match reviewed retained public candidates,
preserving historical methods and adding the distinct P-256 assertion method.
Candidate byte/hash checks, public DID/JWK key correspondence and no-duplicate
API handling pass. **24 tests PASS**, production build/TypeScript **PASS**.

No deployment or signing configuration activation occurred. Live authorization
must be confirmed after approved deployment; existing artifact FAIL and external
status/rendering blockers are unchanged.

## Step 5 retained key review — 2026-10-14

With explicit approval, generated/retained the actual distinct P-256 key and
public candidates outside git. Live baseline equality, historical preservation,
owner-only permissions, private/public correspondence and in-memory SDK synthetic
sign/derive/verify passed. Candidate hashes and rollout gates are recorded in the
migration plan. No private material displayed or uploaded.

No public files, production signing configuration or routing changed. The new
method is not yet publicly authorized; production/public verification and hosted
acceptance remain unrun. Existing supplied artifact FAIL is unchanged.

## Step 4 static preparation — 2026-10-14

User selected the static well-known publication path. The existing preparation
tool now emits matched public DID and JWKS candidates, preserving historical
entries and rejecting key-ID collisions. Tests assert both public candidates
exactly match API output for the same key, and verify DID/JWK key correspondence.
**24 tests PASS**, production build/TypeScript **PASS**.

Only temporary synthetic keys were generated. No real deployment candidate,
public file, routing or production signing configuration changed. A coordinated
public-first static rollout is documented in the migration plan; activation
requires approval. Existing artifact FAIL and status/rendering blockers remain.

## Step 3 API readiness — 2026-10-14

DID and JWKS APIs now derive matching public material using a shared validated
parser, preserve historical methods, reject conflicts/invalid configuration with
logged 503 responses, and use response-body ETags. P-256/P-384 Multikey publication
and legacy secp256k1 hex coordinate parsing are tested. Combined regressions:
**24 PASS**, build/TypeScript **PASS**.

No static DID/JWKS or production configuration changed. The actual did:web URL
still resolves the static document; routing/publication and distinct-key activation
need explicit rollout approval. The observed malformed local key ID is rejected,
not silently corrected. Existing artifact FAIL and status/rendering blockers remain.

## Step 2 preparation — 2026-10-14

With preparation-only approval, corrected the existing key generator to produce
P-256 Multikey material plus a candidate DID adding a distinct assertion method
while retaining historical entries. The old generator incorrectly sliced the
uncompressed secp256k1 point and emitted secrets without a Multikey codec.
Generated dotenv IDs are quoted to preserve `#fragment`.

Real application signing and SDK derivation/verification against the candidate
DID pass; combined regressions: **23 PASS**, build/TypeScript **PASS**. No production
key generated/persisted, public DID changed or environment updated. Static versus
API publication inconsistencies still require separate review/rollout approval.
The supplied artifacts remain FAIL and hosted acceptance remains unrun.

## Step 1 remediation — 2026-10-14

The single-issuance page no longer replaces the API's issuer DID proof with
`EthereumPersonalSignature2024`. It preserves the server credential for
download/preview and permits DID-only issuance without a wallet. Incomplete or
unsigned API responses are rejected explicitly. Separate Ethereum issuance and
legacy wallet verification remain unchanged.

Targeted page-handler and cryptographic/rendering regression tests: **17 PASS**;
production build including TypeScript: **PASS**. No new fields, public key/DID
changes or production issuance performed. These local tests do not establish
public DID authorization or external acceptance. The supplied historical files
remain FAIL; validate a freshly issued artifact after the independent DID key
and status-profile blockers are addressed.

## Actual-artifact results: 2026-10-14 11:22 +08:00

This result supersedes the earlier missing-input/PARTIAL checkpoint below.
Tested the unmodified Downloads files locally, not the historical sample:

| Artifact | Original file SHA-256 | Format |
|---|---|---|
| `certificate-test6.json` | `9174eb41c3fe88003a6dbd511508225930375dac907921f1b0c2b48e8a0c4d2f` | OpenCerts markers present |
| `certificate-tester7.json` | `933ff8e0138e2aca7610be3ff43e03cd4c25a67317445d356ab58beed49c30f9` | Standard, not OpenCerts-mode markers |

**TradeTrust requirements: FAIL, both files. OpenAttestation v2/v3 schema
requirements: FAIL, both files.** These are actual local/reference-code results,
not claimed responses from the hosted TradeTrust portal. No recipient data
uploaded, no runtime changes or new fields, and no source credential modified.

### Exact failures and evidence

| JSON path | Value / condition | Executed evidence |
|---|---|---|
| `/proof/type` | `EthereumPersonalSignature2024` | Installed `@trustvc/w3c-vc@2.4.2` `isSignedDocument = false`; `verifyCredential` returns `verified: false`, error `"proof" type is not of BbsBlsSignature2020.` |
| `/proof/verificationMethod` versus `/issuer` | Wallet address versus `did:web:verifiable.sg` | Pinned upstream `w3cIssuerIdentity.verify` returns `ISSUER_IDENTITY`, `INVALID`, `Issuer and verification method do not match.` on both unchanged files |
| `/credentialStatus/0/type` | `OpenAttestationDocumentStore` | Executed pinned `w3cCredentialStatus.test` returns false; skip fragment: `DOCUMENT_STATUS`, `SKIPPED`, `Document does not have a valid credentialStatus or type.` |
| `/issuers` | Absent | Upstream OA v2 schema validation: `should have required property 'issuers'` |
| `/issuanceDate`, `/openAttestationMetadata` | Absent | Upstream OA v3 schema validation reports both as required |
| `/credentialStatus` under OA v3 | Array, not object | Upstream OA v3 schema: `should be object` |

The installed proof diagnostic is a version-specific structural check, **not**
evidence that BBS is the only supported modern suite. The current reference
modern signature verifiers require `DataIntegrityProof` and the appropriate
cryptosuite; these wallet proofs do not select those branches.

References: TrustVC revision
[`25007968939db4c40231fcfea8b426e33892e6d9`](https://github.com/TrustVC/trustvc/commit/25007968939db4c40231fcfea8b426e33892e6d9),
[issuer verifier](https://github.com/TrustVC/trustvc/blob/25007968939db4c40231fcfea8b426e33892e6d9/src/verify/fragments/issuer-identity/w3cIssuerIdentity.ts),
[status verifier](https://github.com/TrustVC/trustvc/blob/25007968939db4c40231fcfea8b426e33892e6d9/src/verify/fragments/document-status/w3cCredentialStatus.ts).
Issuer verifier code was fetched, transpiled in memory and executed with its real
runtime dependencies. Signature/status predicate tests did not execute mocked
verification functions or claim a full aggregate verifier run.
OA [v2 schema](https://github.com/Open-Attestation/open-attestation/blob/f1339e9af90369ca621aaf1cc246bfcada7264ea/src/2.0/schema/schema.json)
and [v3 schema](https://github.com/Open-Attestation/open-attestation/blob/f1339e9af90369ca621aaf1cc246bfcada7264ea/src/3.0/schema/schema.json)
were fetched from upstream and validated locally using installed Ajv.
OA profile failures must not be applied as mandatory W3C VC v2 rules.

### Other requested checks

- JSON-LD safe expansion: **PASS**, both files.
- Wallet EIP-191 message integrity: **PASS**, both claimed signers recovered
  from the original payloads. This does not establish DID issuer authorization.
- `targetHash`: **PASS bytes32 and exact current application commitment**, both;
  no OA Merkle proof or certificate-specific on-chain issuance proven.
- Public DID: **HTTP 200**, issuer ID correct, redirect to `www`.
  Wallet proof method is absent from public `verificationMethod` and
  `assertionMethod`. Thus reachability PASS is not issuer-authorization PASS.
- Published `/verificationMethod/0/publicKeyJwk` for `#key-1` declares secp256k1,
  but its 65-byte uncompressed point fails two independent checks:
  ethers `computeAddress`: `bad point: equation left != right`;
  Node `ECDH.convertKey`: `Failed to convert Buffer to EC_POINT`.
  Do not infer a matching wallet address from invalid coordinates.
- Issuer metadata is a W3C DID string; no OA v2 issuer collection.
- Subject template fields exist, but no W3C `renderMethod`; external rendering
  was not run. Subject template metadata is not sufficient to prove rendering.
- Both proofs have `signature`, not a supported Data Integrity `proofValue`.
  Neither artifact is the issuer-DID DataIntegrityProof output exercised by
  the earlier synthetic signing regression.

### Blocker and recommended fix (not implemented)

Primary reproduced blocker: unsupported wallet `proof.type` and issuer/method
mismatch. Reissue through the existing issuer-DID signing path with a supported
suite and a valid public verification key authorized for that issuer. Do not
rename the wallet proof to `DataIntegrityProof` or change `verificationMethod`
on an already signed file. Investigate the public JWK separately, retaining
historical key identities and requiring approval before any DID changes.

Status-profile and external-renderer work remain separately gated; do not add
new fields, remove revocation checks or fabricate OA metadata merely to pass.
Hosted acceptance remains unrun without disclosure consent.

## External validation follow-up: 2026-10-14 11:13 +08:00

User reports two JSON attachments in chat, but their contents and readable paths
are not exposed to this session. Workspace/session JSON discovery revealed no
fresh artifact beyond the already documented historical samples.

- Fresh-credential TradeTrust test: **NOT RUN; overall PARTIAL**.
- OpenAttestation verifier test on that artifact: **NOT RUN; PARTIAL**.
- Exact failing field: **not established**. The source-based profile findings
  below are not a captured verifier rejection of the inaccessible attachments.
- Artifact-specific DID/proof/status/hash/OA/issuer/template checks: blocked.
- No new fields, runtime changes, external uploads or production writes.
- Recommended next action: obtain readable JSON/local paths, then capture the
  exact verifier version, result fragments and JSON path without modifying the
  credential. Recommend a field correction only after reproducing its failure.

## Scope and evidence boundary

Resumed the existing audit, not a new repository audit. The existing
`output/phase5/sample-opencerts-mode-credential.json` is an illustrative historical
sample (custom wallet proof, different contexts/type markers, no current
commitment), not a fresh production credential. The requested fresh and
known-good legacy production files have not yet been supplied.

Local evidence uses `buildVCPayload`, both DID issuance entry points, temporary
P-256 keys, the real JSON-LD processor and pinned TrustVC W3C signing/derivation
libraries. Public DID/DNS/contract reads use no private keys or transactions.
No credential was uploaded to a third-party verifier.

## Reference comparison

Reviewed upstream source on 2026-10-14:

- TradeTrust documentation revision
  [`e728934a7ce87613bb8638f32f6d0ce50e77bacd`](https://github.com/TradeTrust/documentation/commit/e728934a7ce87613bb8638f32f6d0ce50e77bacd).
- TrustVC revision
  [`25007968939db4c40231fcfea8b426e33892e6d9`](https://github.com/TrustVC/trustvc/commit/25007968939db4c40231fcfea8b426e33892e6d9).
- [W3C creation guide](https://github.com/TradeTrust/documentation/blob/e728934a7ce87613bb8638f32f6d0ce50e77bacd/docs/how-tos/create-w3c-document.md):
  VC Data Model 2.0, Multikey issuer, `ecdsa-sd-2023`; a Token Registry is needed
  for transferability, not ordinary certificate authenticity.
- [Credential status guide](https://github.com/TradeTrust/documentation/blob/e728934a7ce87613bb8638f32f6d0ce50e77bacd/docs/how-tos/credential-status.md):
  W3C paths include `TransferableRecords`, bitstring revocation, and explicitly
  non-revocable/no-status credentials.
- [OpenAttestation document overview](https://github.com/TradeTrust/documentation/blob/e728934a7ce87613bb8638f32f6d0ce50e77bacd/docs/how-tos/open-attestation/verifiable-documents/overview.md)
  and [raw document example](https://github.com/TradeTrust/documentation/blob/e728934a7ce87613bb8638f32f6d0ce50e77bacd/docs/how-tos/open-attestation/verifiable-documents/dns-txt/raw-document.mdx):
  separate OA DNS-TXT and DNS-DID issuance profiles; OA wrapping is not achieved
  by adding a type name to a W3C credential.
- [TrustVC verifier assembly](https://github.com/TrustVC/trustvc/blob/25007968939db4c40231fcfea8b426e33892e6d9/src/verify/verify.ts),
  [W3C status verifier](https://github.com/TrustVC/trustvc/blob/25007968939db4c40231fcfea8b426e33892e6d9/src/verify/fragments/document-status/w3cCredentialStatus.ts),
  [empty-status verifier](https://github.com/TrustVC/trustvc/blob/25007968939db4c40231fcfea8b426e33892e6d9/src/verify/fragments/document-status/w3cEmptyCredentialStatus/index.ts),
  and [modern proof handling](https://github.com/TrustVC/trustvc/blob/25007968939db4c40231fcfea8b426e33892e6d9/src/verify/fragments/document-integrity/w3cModernSignatureIntegrityFactory.ts).

These are source comparisons, not evidence that the hosted reference verifier
is running those exact revisions. Capture its actual version during live testing.

## Field-level validation

| Field | Current implementation / observation | Result |
|---|---|---|
| `@context` | VC v2 + Data Integrity v2 + embedded terms; W3C/OpenCerts adds legacy extensions | PASS safe JSON-LD expansion for template identifiers; custom contexts alone do not establish a supported external profile |
| `type` | `VerifiableCredential`; OpenCerts adds `OpenAttestationDocument2018` | PARTIAL: syntactically expandable marker, not an OA wrapper discriminator |
| `issuer` | `did:web:verifiable.sg` | PASS syntax/public accessibility; production key match unverified |
| `verificationMethod` | DID-signed fixture uses `did:web:verifiable.sg#key-1` | PASS local fixture; public DID currently advertises secp256k1 JWK rather than the P-256 Multikey used in tests |
| `proof` | DID path returns `DataIntegrityProof`, `ecdsa-sd-2023`, `assertionMethod`, `proofValue`; wallet path remains custom | PASS local DID derivation and verification; wallet proof is not established as a TradeTrust-supported suite |
| `credentialSubject` | Certificate ID/name/email/template/description, `@type: Person`, certificate category placed in `type` | PARTIAL: identifier category passes; human-readable category with spaces fails safe JSON-LD `@type` expansion |
| `credentialStatus` | Nonempty array of `OpenAttestationDocumentStore` entries, nested OCSP metadata | FAIL current upstream W3C status selection: not a recognized bitstring/status-list/transferable-records profile; empty-status verifier also skips |
| Store ID | Now `did:ethr:0x...#certificateId`, no duplicate prefix | PASS string/address shape only; no assertion that TrustVC resolves this custom status as a contract |
| `targetHash` | Now an actual bytes32 keccak commitment included before signing | PASS local exact hash/length/tamper tests; NOT an OA salted target hash or Merkle proof |
| On-chain issuance | Optional asynchronous service, not a confirmed transaction prerequisite | FAIL assurance: no certificate-specific confirmed issuance receipt or `isIssued` result |
| OA fields | No OA v2 `version/data/signature` envelope or OA v3 metadata/proof envelope | FAIL if choosing an OA profile; not inherently required for the W3C path |
| Renderer | Local React templates; no tested W3C `renderMethod` integration | PARTIAL: local viewing passes; external rendering unverified |

**Verification decision:** TradeTrust **PARTIAL**, with a known status-profile
failure and blocked production identity/on-chain tests. Do not present the local
signature PASS as a complete TradeTrust PASS.

## Safe changes implemented

In [trustvc.ts](../lib/trustvc.ts):

1. Prepare the existing application-specific commitment **before** signing.
   Adding a field after signing changes signed RDF and breaks external integrity.
2. Use the `0x` keccak result directly. Previously `Buffer.from(hexString)` encoded
   ASCII hex characters, producing a non-bytes32 value.
3. Copy status entries instead of mutating caller input; recalculate after removing
   an existing commitment; leave unrelated status types untouched.
4. Remove the duplicated `0x` prefix in newly constructed status IDs.

These affect new issuance only. Existing stored documents, wallet-proof
verification, aliases, public DID keys, authentication and service configuration
are unchanged. **No claim that already invalid proofs are repaired.** Previously
issued artifacts must never be rewritten to hide failed verification.

## Remaining gaps and proposed changes

Risk is implementation/rollout risk, not a security audit severity.

| Gap / root cause | Files affected | Risk | Proposed change / gate |
|---|---|---|---|
| Unsupported W3C status type; adding OA labels does not add a verifier | `lib/trustvc.ts`, `lib/constants.ts`, `app/api/issue/route.ts`, revocation services/routes | HIGH | Separate opt-in supported W3C revocation profile, with actual bitstring status publication/update/verification; preserve legacy path. Do not strip statuses to obtain a green result |
| Public DID key may not match signer; local loader serves an environment-derived Multikey and can mask this | `lib/trustvc.ts`, `lib/did-utils.ts`, `public/.well-known/did.json`, `app/api/.well-known/did/route.ts` | HIGH | Compare fresh production proof/key to public DID. If migration needed, add a distinct key ID while retaining historical verification keys; no in-place rotation |
| Locally locked `@trustvc/trustvc@0.0.0` exports no verifier functions | `package.json`, `package-lock.json`, `lib/trustvc.ts`, patches | HIGH | Stage a pinned maintained SDK/versioned API upgrade with lifecycle/auth/legacy fixtures before touching production. Do not add a success fallback |
| Certificate category is a JSON-LD type, not a literal; labels with spaces fail | `lib/constants.ts` field map, `lib/trustvc.ts`, `lib/credential-mapper.ts`, consumers of subject `type` | MEDIUM | New opt-in profile uses literal `certificateType` and genuine semantic `type`; retain old-reader fallback and test all UI category values |
| Configured contract does not satisfy tested Document Store ABI; DNS points elsewhere | `lib/constants.ts`, `lib/document-store.ts`, deployment environment, DNS | HIGH | Inventory actual contract type, network, ownership and intended profile; reconcile existing infrastructure only with approval |
| Registration service has invalid default address and ethers-v5 signer lookup, and API success precedes receipt | `lib/document-store.ts`, `app/api/issue/route.ts`, credential persistence | HIGH | Reuse validated config, ethers-v6 runner, deterministic registration outcomes/receipt tracking behind a flag; test with mocked chain and staging funds before enabling |
| Custom `targetHash` is not an OA commitment format | `lib/trustvc.ts`, on-chain registration and revocation paths | HIGH | Only if OA export is required, use maintained wrapping/hash/issuance libraries as a distinct format; never remove the current W3C proof or fabricate an OA signature |
| External rendering protocol not wired | `lib/trustvc.ts`, `lib/constants.ts`, `app/templates/`, renderer integration | MEDIUM | Opt-in `renderMethod` with reachable, protocol-compliant renderer; retain local templates and old template IDs |
| Fresh and actual legacy production artifacts missing | No runtime code change | LOW | Receive files locally, establish baseline expected results, obtain consent before external uploads |

## Document Store / Token Registry decision

- **No Token Registry required** for non-transferable academic/insurance
  certificates. Deploying one does not solve the current status mismatch.
- A supported W3C bitstring revocation profile needs no Document Store. Omitting
  status would explicitly mean no revocation and is not a safe silent substitute.
- For an OA DNS-TXT Document Store profile, deployment alone is insufficient:
  correct contract/network/roles, wrapped document commitment, confirmed issuance,
  matching DNS binding and revocation behavior are required.
- Read-only Sepolia observations: configured address
  `0x92600b6B5fE4D15D87d7d264C6cAdCcaf9D74594` has 15,993 code bytes and
  `name() = Verifiable`, but `isIssued(0x00...00)` and `isRevoked(0x00...00)` revert.
  This probe is not a certificate issuance check or conclusive contract inventory.
- DNS `_document-store.verifiable.sg` binds
  `0x4B30674f8F77C0b1Ab4C8A34b2a85C295A3aE2D4` on chain 11155111; that address
  returns no code on the same RPC/network. No `openatts` binding was observed at
  the configured identity location `verifiable.sg` itself.
- **Current deployment is not demonstrated sufficient. Do not deploy new
  contracts until inventory establishes the intended profile and reuse options.**

## Test loop results

| Test | Result / limitation |
|---|---|
| Issue | PASS local DID entry points for all format aliases; no authenticated production/database write |
| Verify | PASS real TrustVC derived-proof verification using isolated test DID; native aggregate verifier cannot be exercised with the empty locally pinned wrapper |
| View | PASS serialized credential mapping and server rendering of all 4 local React templates |
| Legacy | PASS synthetic legacy-style wallet signature verification/view and tamper rejection; actual preexisting production file pending |
| OpenCerts-mode JSON | PASS contexts/type/subject marker, required skeleton, corrected status ID, bytes32 commitment and protected commitment tamper test |
| Build | PASS `npm run build` before and after fixes, 24 generated static pages |
| Type check | PASS `tsc --noEmit --incremental false` |
| External reference verifier | NOT RUN; do not infer PASS from local crypto |
| Registration/login/reset/Supabase/Resend | Unchanged; production E2E not rerun |

Run: `node --test lib/trustvc.test.js` (Node 22.15+), then `npm run build`.
Do not commit production certificates, keys, cookies or environment files.

For the before/after control, the current tests were run with the original
`HEAD` signing source loaded in memory (only the separate ID prefix typo
normalized). All four DID modes and the legacy DID entry point failed derived
verification with `Invalid signature`; the wallet regression passed. The fixed
working tree passes all seven tests. This isolates post-sign mutation as a
reproduced integrity failure rather than a speculative compatibility claim.

## Next action

Receive the fresh and actual known-good legacy certificate files. Verify them
unchanged, including public DID resolution without local key substitution.
Then obtain profile/configuration approval before supported-status and SDK
migrations; follow [MIGRATION_PLAN.md](./MIGRATION_PLAN.md).
