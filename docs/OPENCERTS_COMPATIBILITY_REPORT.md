# OpenCerts compatibility report

Updated: 2026-10-14  
Overall: **FAIL for the supplied artifacts against tested reference requirements;
hosted portal execution not performed**

## Step 12 local opt-in status profile — 2026-10-14

User-approved new opt-in profile uses signed VC v2 Bitstring Status Lists rather
than claiming the existing custom OCSP status is checked. New DID-only
issue/verify/view fixtures pass, including suspend/reinstate/revoke and expired,
tampered, unavailable or malformed status rejection. **31 tests PASS**,
production build/TypeScript PASS; embedded PostgreSQL privileges and atomic
transition tests pass. Existing defaults, wallet paths and historical signed
artifacts are unchanged.

Wire format matches checked W3C gzip/Multibase/bit-order requirements; bounded
expansion protects the verifier. Installed status SDK encoding needs the wrapper's
`u` prefix. No external consumer has yet been shown to accept that exact artifact.
Migration is unapplied, feature/signing inactive, and no production or hosted
OpenCerts acceptance test was performed.

**OpenCerts result is PARTIAL/unverified for the new profile; supplied historical
artifacts remain FAIL.** Missing external renderMethod, fresh production artifact
and reference/hosted verifier acceptance remain blockers. This is not a conversion
to an OA wrapped OpenCerts document, and the unchanged default OA-style status
continues to fail closed as unsupported in the new ECDSA path.

## Step 11 local ECDSA application verification — 2026-10-14

Implemented/tested actual application base/derived ecdsa-sd-2023 verification and
resolved issuer assertion authorization without relying on missing aggregate SDK
exports. Tampered/unauthorized/invalid-date inputs fail; legacy wallets retained.
Nonempty credentialStatus remains explicitly unsupported with invalid overall
result. Current issuance status is therefore still an activation blocker.
**24 tests PASS**, production build/TypeScript **PASS**; no deployment, activation
or external acceptance claim.

## Step 10 application verification gate — 2026-10-14

Vercel confirms UI deployment success. Local application DID verification requires
aggregate functions absent from the installed package and uses a historical-only
loader. Earlier direct SDK tests are not proof of this application branch.
Production runtime exports are unconfirmed; no live verification failure invented.
Signing remains inactive pending an application-entry-point fix/test, with
status/rendering and external acceptance still unresolved.

## Step 9 UI fix pushed — 2026-10-14

Approved UI proof-preservation change/test pushed as `26b61bf2`; Vercel pending.
Eighteen targeted tests and local build/TypeScript PASS. No signing activation or
production issue/verify/view run; remaining API/tooling changes are local.
The deployment must complete before treating downloads as proof-preserving.
Status/rendering, distinct-method application verification and external acceptance
remain pending checks.

## Step 8 live authorization — 2026-10-14 12:06 +08:00

Public-only Vercel deployment is successful. Live DID/JWKS exactly match reviewed
candidate bytes; assertion authorization and live JWK/Multikey correspondence
PASS. Signing configuration remains unchanged and runtime proof-preservation
fixes remain local. This is public-key publication success, not fresh production
issuance or OpenCerts acceptance. Status/rendering remain unresolved.

## Step 7 public-only deployment pending — 2026-10-14

Approved public-document-only commit `7963ae63` is pushed to main. Vercel confirms
a pending deployment, but initial live DID/JWKS checks still lack the new key.
No signing activation or external acceptance performed. Pending runtime fixes
remain local and were not included in the push.

## Step 6 local public integration — 2026-10-14

Integrated reviewed public DID/JWKS candidates locally, retaining historical
entries and adding the distinct P-256 assertion method/public JWK. Exact candidate
bytes/hashes and matching public key correspondence verified; **24 tests PASS**,
production build/TypeScript **PASS**.

No commit/deployment/signing activation. Live DID authorization, fresh production
issuance and external verifier acceptance remain unverified. No status/rendering
compatibility claim or new credential fields.

## Step 5 retained key review — 2026-10-14

Actual distinct P-256 deployment material was generated and retained with
creation/review-only approval. Historical live baseline equality and candidate
preservation checks pass. Independent JWK challenge verification and SDK
in-memory synthetic signing/derivation/verification against the retained candidate
pass. No private material displayed, uploaded or placed in git.

The public static DID/JWKS and signing environment remain unchanged; new public
authorization is pending. This local candidate validation is not hosted OpenCerts
acceptance and does not resolve status/rendering requirements.

## Step 4 static preparation — 2026-10-14

Static DID/JWKS candidate preparation is selected. The generator emits matching
public candidates from a single P-256 key while retaining historical methods and
JWKS entries. Tests verify exact static/API equivalence and key correspondence;
**24 tests PASS**, production build/TypeScript **PASS**.

No actual deployment key/candidate persisted, public static files changed or
signing configuration activated. Public-first rollout and preservation gates are
documented in the migration plan. External verification/rendering remain unrun;
no OpenCerts compatibility PASS is claimed.

## Step 3 API readiness — 2026-10-14

Shared DID/JWKS API publication now handles validated P-256/P-384 public Multikeys,
emits corresponding JWK curves/coordinates, preserves historical methods and
rejects key-ID conflicts explicitly. Tests exercise actual handlers, conditional
requests, key correspondence and failure logging. **24 tests PASS** and
**build/TypeScript PASS**.

Static well-known documents and production environment remain unchanged. These
API changes are not yet active at the did:web URL; reviewed publication/routing
and matching distinct-key activation remain gated. No external acceptance claim,
new credential fields or changes to working auth/issuance services.

## Step 2 preparation — 2026-10-14

Prepared and tested a supported P-256 Multikey generation/candidate-publication
workflow, preserving existing public methods and adding a distinct assertion
method. No production key, existing environment or public DID was changed.
The old generator's point slicing, untyped secret encoding and unquoted dotenv
method ID issues are addressed in the preparation tool only.

Actual application signing plus SDK derivation/verification against a candidate
DID pass. Combined regressions: **23 PASS**, build/TypeScript **PASS**.
Public static/API DID publication consistency still needs review before rollout.
No new credential fields, external upload or OpenCerts acceptance claim.

## Step 1 remediation — 2026-10-14

Fixed the single-issuance UI overwriting the server-issued DID proof with a wallet
proof. The API credential now remains unchanged in preview/download. DID-only
issuance does not request MetaMask; unsigned/incomplete API responses cannot
fall back to wallet signing. Existing separate Ethereum behavior remains.

Validation: **17 targeted page-handler/cryptographic/rendering tests PASS** and
**production build/TypeScript PASS**. No new credential fields or public DID
changes. No hosted verification or live authenticated issuance performed.
Existing supplied certificates remain FAIL and are not edited by this fix.
Public-key authorization, status support and external rendering remain blockers;
this is not an OpenCerts compatibility PASS.

## Actual-artifact results: 2026-10-14 11:22 +08:00

Supersedes the missing-attachment/PARTIAL checkpoint below. Both actual Downloads
files are now readable and were tested unchanged, with no recipient data uploaded.

| Artifact | SHA-256 | Mode |
|---|---|---|
| `certificate-test6.json` | `9174eb41c3fe88003a6dbd511508225930375dac907921f1b0c2b48e8a0c4d2f` | OpenCerts marker/type present |
| `certificate-tester7.json` | `933ff8e0138e2aca7610be3ff43e03cd4c25a67317445d356ab58beed49c30f9` | Standard mode, not OpenCerts markers |

**OpenCerts reference requirements: FAIL, both files. OpenAttestation v2/v3
schema requirements: FAIL, both files.** A hosted OpenCerts upload was not run;
these are local SDK/reference-code/schema outcomes, not a portal transcript.

### Exact failing fields

1. `/proof/type = EthereumPersonalSignature2024`. Installed TrustVC W3C
   validator returns `isSignedDocument = false` and
   `{"verified":false,"error":"\"proof\" type is not of BbsBlsSignature2020."}`.
   Current upstream W3C signature verifiers likewise do not select this wallet
   proof. The old installed diagnostic does not prescribe BBS as a fix.
2. `/proof/verificationMethod` is a wallet address, while `/issuer` is
   `did:web:verifiable.sg`. Running upstream `w3cIssuerIdentity.verify` at
   revision `25007968939db4c40231fcfea8b426e33892e6d9` on both actual artifacts
   returns **INVALID**, `Issuer and verification method do not match.`
3. `/credentialStatus/0/type = OpenAttestationDocumentStore`. Executed upstream
   W3C status selector returns false and its skip fragment says
   `Document does not have a valid credentialStatus or type.` This custom status
   is not an accepted status-list entry.
4. For an **OA profile only**, locally executing the upstream OA schemas reports:
   v2 missing `/issuers`; v3 missing `/issuanceDate` and
   `/openAttestationMetadata`, with `/credentialStatus` expected as object.
   The added OA type marker in test6 does not satisfy these schema constraints.

Issuer verification used the real upstream function and dependencies. Other
fragment tests exercised selection/skip only, not a mocked aggregate verifier.
The OpenCerts reference dispatcher/validity sources are linked below. OA schema
revision is `f1339e9af90369ca621aaf1cc246bfcada7264ea`:
[v2](https://github.com/Open-Attestation/open-attestation/blob/f1339e9af90369ca621aaf1cc246bfcada7264ea/src/2.0/schema/schema.json),
[v3](https://github.com/Open-Attestation/open-attestation/blob/f1339e9af90369ca621aaf1cc246bfcada7264ea/src/3.0/schema/schema.json).
Schema validation used local installed Ajv; no certificate was sent to a web
schema validator. These OA constraints are not universal W3C VC v2 requirements.

### Passing and separately blocked checks

- Both files safely expand as JSON-LD. No protected-term redefinition reproduced.
- Both EIP-191 signatures recover the claimed wallet over the unchanged
  application-canonical payload. Native wallet verification success therefore
  does not imply OpenCerts issuer identity or supported proof success.
- Both hashes are bytes32 and match recomputation of the existing application
  commitment. No OA Merkle proof or confirmed certificate-specific store
  issuance was established.
- Public DID returns HTTP 200 and the correct issuer ID after redirect to `www`,
  but neither wallet method is published or authorized in `assertionMethod`.
- The published `#key-1` JWK declares secp256k1; its uncompressed point fails
  ethers (`bad point: equation left != right`) and Node ECDH
  (`Failed to convert Buffer to EC_POINT`). No public key replacement performed.
- Issuer is a DID string, not OA `/issuers` metadata; OA metadata is absent.
- Subject `$template` and `$templateVersion` exist, but top-level `/renderMethod`
  is absent. OpenCerts W3C renderer selection reads `renderMethod[0].id`;
  external renderer success is not proven by these local subject fields.

### Blocker and recommended fix (not implemented)

Reissue via the existing **issuer-DID signing path**, using a supported
cryptographic suite and a valid, publicly authorized verification key. The
provided files are wallet-proof outputs despite `issuingMethods: ["did"]`.
Do not simply relabel `/proof/type` or replace its verification method.
Separately investigate the invalid public JWK and the supported revocation
profile under explicit approval. Preserve working wallet verification and
existing signed artifacts.

No new credential fields, code, production configuration or DID changes in this
validation. Hosted verifier uploads and external rendering remain unperformed.

## External validation follow-up: 2026-10-14 11:13 +08:00

User reports two JSON attachments in chat. Neither content nor a readable
attachment path is available to this session; workspace/session discovery found
only existing historical samples and project JSON.

- OpenCerts fresh-artifact test: **NOT RUN; overall PARTIAL**.
- OpenAttestation fresh-artifact test: **NOT RUN; PARTIAL**.
- Exact failing field: **not established for those attachments**.
- Artifact-specific DID resolution, verificationMethod, proof, credentialStatus,
  targetHash, OpenAttestation metadata, issuer metadata and template metadata:
  blocked until the JSON is readable.
- No runtime/credential-field changes or external uploads performed.
- Recommended fix at this stage is input access, not credential mutation:
  provide readable local paths or pasted JSON; then capture actual verifier
  diagnostics and their exact JSON paths before proposing field corrections.

## Authoritative correction to earlier findings

Current OpenCerts is not limited to OpenAttestation-wrapped documents.
The reference site's verifier dispatches OA v2/v3 documents to
`openAttestationVerifiers`, and other credentials to `w3cVerifiers`.
It uses `isValidOpenCert` across document integrity, status and issuer identity.

Therefore:

- Do not replace the working W3C `proof` with invented
  `OPENATTACKATION_JSON_LD_PROOF`, `credentialSignature` or `commitment` fields.
- Adding `OpenAttestationDocument2018` or `_type` does not turn a VC into a
  wrapped OA certificate.
- A Token Registry is not a universal OpenCerts requirement.
- Registry recognition and cryptographic validity are different concerns;
  absence from the OpenCerts issuer registry is not automatically universal
  cryptographic failure.

## References and examples compared

OpenCerts source revision:
[`d61d3bbf6354425ad9571962e40fd10cd4b9fc4e`](https://github.com/OpenCerts/opencerts-website/commit/d61d3bbf6354425ad9571962e40fd10cd4b9fc4e).
TrustVC revision:
[`25007968939db4c40231fcfea8b426e33892e6d9`](https://github.com/TrustVC/trustvc/commit/25007968939db4c40231fcfea8b426e33892e6d9).

1. [OpenCerts verifier dispatch](https://github.com/OpenCerts/opencerts-website/blob/d61d3bbf6354425ad9571962e40fd10cd4b9fc4e/src/sagas/certificate.ts):
   separate W3C and OA paths, failover network providers, full verification
   fragments before viewer navigation.
2. [OpenCerts Sepolia example](https://github.com/OpenCerts/opencerts-website/blob/d61d3bbf6354425ad9571962e40fd10cd4b9fc4e/public/static/demo/sepolia.opencert):
   OA v2 `version`, salted `data`, renderer object and issuer metadata, unlike the
   application's raw W3C subject/status layout.
3. [OpenCerts data/renderer selection](https://github.com/OpenCerts/opencerts-website/blob/d61d3bbf6354425ad9571962e40fd10cd4b9fc4e/src/utils/utils.ts):
   W3C reads `renderMethod[0].id`; OA v2 reads decoded `$template.url`; OA v3
   reads `openAttestationMetadata.template.url`.
4. [TrustVC status verification](https://github.com/TrustVC/trustvc/blob/25007968939db4c40231fcfea8b426e33892e6d9/src/verify/fragments/document-status/w3cCredentialStatus.ts),
   [status dispatch](https://github.com/TrustVC/trustvc/blob/25007968939db4c40231fcfea8b426e33892e6d9/src/verify/verify.ts)
   and [OpenCerts validity/registry](https://github.com/TrustVC/trustvc/blob/25007968939db4c40231fcfea8b426e33892e6d9/src/open-cert/verify.ts).
5. [TradeTrust OA raw document example](https://github.com/TradeTrust/documentation/blob/e728934a7ce87613bb8638f32f6d0ce50e77bacd/docs/how-tos/open-attestation/verifiable-documents/dns-txt/raw-document.mdx)
   and [W3C creation example](https://github.com/TradeTrust/documentation/blob/e728934a7ce87613bb8638f32f6d0ce50e77bacd/docs/how-tos/create-w3c-document.md)
   clarify the two distinct issuance models.

These are inspected repository revisions, not a claimed version of the hosted
OpenCerts deployment. The old local sample is not a fresh production artifact;
fresh/legacy production JSON is awaiting the user.

## Field comparison

| Field | W3C/OpenCerts result | OA comparison |
|---|---|---|
| `@context` | Local expansion PASS; protected duplicate fixed in prior work | Embedded legacy terms do not replace OA wrapping/schema validation |
| `type` | `VerifiableCredential` + local OA marker; syntactically valid | OA v2 routing uses envelope/version shape, not this type marker |
| `issuer` | Public `did:web:verifiable.sg` is reachable | OA DNS-TXT profile instead carries issuer/store/identity proof metadata in the correct OA structure |
| `verificationMethod` | Local DID-signed fixture is `#key-1`; production key match pending | Do not replace the historical method IDs or keys in existing certificates |
| `proof` | Local Data Integrity ecdsa-sd derivation/verification PASS after pre-sign commitment fix | Current wallet proof is custom; not a supported OA Merkle proof |
| `credentialSubject` | Fields and local templates render with identifier category | Human-readable category currently maps to JSON-LD `type`, causing failures for spaced labels |
| `credentialStatus` | FAIL current upstream status recognition: custom `OpenAttestationDocumentStore` | OA document-store validation uses its own OA verifier and wrapped document metadata |
| Store linkage | Corrected new ID prefix; chain binding is not supported merely by `did:ethr` syntax | Existing configured contract fails tested store ABI; DNS points at another code-empty Sepolia address |
| `targetHash` | PASS 32-byte shape and signed integrity locally; local commitment algorithm | Not an OA salted targetHash/MerkleRoot; cannot infer OA `isIssued` from it |
| OpenCerts fields | Local `_type`, `$template` string and version exist | W3C OpenCerts renderer needs top-level `renderMethod`; local subject `$template` is not used by its W3C renderer selector |
| Renderer | Local viewing PASS | External view NOT VERIFIED; adding a URL alone will not implement the renderer message protocol |

## Decision

**OpenCerts verification: PARTIAL.**

- **PASS:** local JSON-LD with category identifiers, issuance, actual derived
  signature verification, local viewing, legacy-style wallet regression.
- **FAIL (source-based profile check):** custom status is not a supported W3C
  status verifier input; nonempty status cannot use the empty-status path.
- **BLOCKED:** fresh production/public-DID key alignment, confirmed intended chain
  linkage, known-good historical artifact regression and external end-to-end test.
- **NOT RUN:** live OpenCerts file upload. No certificate data sent externally.

Do not advertise full compatibility, official issuer recognition or guaranteed
external rendering from a local proof-generation success.

## Remaining gaps, risks and proposed changes

| Root cause | Files affected | Risk | Proposed change |
|---|---|---|---|
| Unsupported W3C revocation profile | `lib/trustvc.ts`, `lib/constants.ts`, status/revocation APIs | HIGH | Separate opt-in bitstring-status profile with hosted signed status list and real revocation tests; retain old certificates/readers |
| Production public DID publishes secp256k1 JWK; test signer uses P-256 Multikey; actual signer key unknown | `public/.well-known/did.json`, DID API, `lib/did-utils.ts`, signing config | HIGH | Compare actual fresh proof to public key first; add distinct compatible key only with approval and preserve old verification methods |
| Local SDK wrapper is empty `0.0.0` | `package.json`, lockfile, `lib/trustvc.ts` | HIGH | Pin maintained SDK and adapt its versioned verifier API in staging; no broad production upgrade in this patch |
| W3C category stored as JSON-LD type | field map, subject builder, mapper and UI readers | MEDIUM | Literal `certificateType` in a versioned profile; keep legacy `type` fallback and test all category labels |
| OpenCerts W3C renderer expects `renderMethod`, not subject `$template` | builder, constants, `app/templates/`, renderer service | MEDIUM | Versioned renderer metadata and protocol-compliant reachable renderer; keep local viewing unchanged |
| Document-store registration/DNS/configuration are inconsistent | `lib/document-store.ts`, `lib/constants.ts`, issuance API, environment/DNS | HIGH | Inventory/reconcile actual contracts/network and permissions, then stage registration receipt tests; no new contract deployment |
| Historical reports prescribe fabricated wrappers | `docs/GAP_ANALYSIS.md`, `docs/MIGRATION_PLAN.md`, `docs/AUDIT_PROGRESS.md` | LOW | Mark old findings superseded and use current source-backed reports |
| Actual production examples missing | Test input only | LOW | Obtain fresh and previously working files without committing private recipient data |

Detailed on-chain read results and root causes are recorded in
[TradeTrust report](./TRADETRUST_COMPATIBILITY_REPORT.md#document-store--token-registry-decision).
No Token Registry is required merely for OpenCerts certificates. Document Store
deployment alone cannot make the current hybrid VC status a supported OA format.

## Implemented safe fixes and test results

- Commitment calculated before signing, correctly encoded as bytes32; caller
  input remains unchanged. Old stored certificates are not rewritten.
- New status IDs no longer contain `0x0x`.
- `node --test lib/trustvc.test.js`: **7/7 PASS**, including all 4 aliases,
  TrustVC disclosure verification, viewer mapping, rendering all 4 local
  templates, protected-hash tamper rejection, DID entry point and synthetic
  legacy wallet verification/tamper rejection.
- `tsc --noEmit --incremental false`: **PASS**.
- `npm run build`: **PASS** before and after code changes.
- Auth, Supabase, Resend, public DID files and production settings unchanged.
  Full authenticated production lifecycle and actual legacy certificate
  verification remain untested, not assumed passing.

## Next action

Supply the fresh OpenCerts-mode and known-good legacy production JSON locally.
Establish unchanged-file baselines, agree on W3C status/renderer profile and
public-key handling, then request consent before reference-site uploads.
