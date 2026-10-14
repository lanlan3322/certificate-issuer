# MIGRATION PLAN - TradeTrust / OpenCerts Compatibility Layer

## Step 12: approved opt-in Bitstring Status List rollout — local only

User approved a new optional profile, not a rewrite of existing credentials.
Implementation and **31 regression tests PASS**, including embedded PostgreSQL
function execution/privileges/atomic rollback; build/TypeScript **PASS**.

Activation gates, in order:

1. Review/explicitly approve deployment of pending verification, status API,
   persistence/revocation and UI changes. Leave feature disabled initially.
2. Back up and approve applying
   `database/migrations/006_bitstring_status.sql` through the existing Supabase
   migration process. This is additive and has not run against production.
   Confirm actual production roles/schema and RPC permissions in staging first.
3. Separately approve/configure the retained matching P-256 server signer. Its
   public assertion method is already published; never regenerate or print the
   retained secret. Service-role configuration must remain server-only.
4. Set `STATUS_LIST_BASE_URL=https://verifiable.sg` and
   `ENABLE_BITSTRING_STATUS_LIST=true` only after checking public signed-list
   publication. Public URL has no login requirement; lists contain no recipient
   fields. A configured feature with unavailable DB/signing returns an error.
5. Explicitly select the opt-in checkbox or send `statusProfile: "bitstring"`
   for persisted DID-only single issuance. Omitted/legacy requests and bulk
   retain the existing profile. Failed issuance consumes its reservation;
   retry with a new credential identifier, never reuse an index.
6. Use authorized synthetic data to run production issue/verify/view plus
   revoke/suspend/reinstate and legacy/auth/email checks. Status lists are
   generated from persisted states; signed snapshots expire within 60 seconds,
   so already retrieved snapshots can remain valid until their expiry.
7. Validate exact fresh artifact in external reference/hosted verifiers before
   claiming compatibility. External renderMethod and historical OA-format gaps
   remain; a signed W3C status list is not an OA Merkle proof or document-store
   registration. No new Document Store/Token Registry contract is required for
   this DID-only nontransferable W3C profile.

The installed status SDK returns bare base64url, so publication adds the W3C
Multibase `u` prefix and verification performs bounded gzip expansion. External
consumers must be tested with this exact encoding; local success alone cannot
establish their support. Allocation is sequential (never reused), not randomized;
lists reveal aggregate state and changes, not recipient names/identifiers.

Rollback before any opt-in issuance: disable the flag and keep legacy behavior.
After any opt-in credential is delivered, keep its signed-list publication and
durable allocations available: disabling publication makes it unverifiable.
Do not drop the allocation table, delete/reuse indices or rewrite signed VCs.

## Step 11: local application ECDSA path ready; status still blocks activation

The actual application verification entry point now uses installed W3C SDK
primitives for `DataIntegrityProof/ecdsa-sd-2023`, resolves public issuer assertion
authorization and pins the authorized method. Base/derived proofs, tampering,
authorization and validity-period tests pass. No signed status is stripped.
Wallet and other legacy paths remain unchanged. Twenty-four regressions and
production build/TypeScript pass; no deployment/configuration activation.

**Do not activate signing as a successful end-to-end fix yet.** Nonempty status
returns explicit unsupported status with `valid: false`, even when signature and
issuer pass. Current builder includes OpenAttestationDocumentStore and therefore
still hits this gate. Status-less fixtures are test-only, not a proposed production
workaround. Inspect/approve supported revocation implementation next; do not remove
status, manufacture valid fragments or silently migrate existing signed documents.
External renderer compatibility and hosted acceptance remain later gates.

## Step 10: verification gate before signing activation — 2026-10-14

UI commit `26b61bf2` Vercel deployment success confirmed. No authenticated live
issuance/download test or signing activation performed.

Actual application DID verification remains blocked locally: aggregate TrustVC
exports no `verifyDocument`/`isValid`, and its local document loader hardcodes
the historical method. Direct SDK verification regression success is not
application-entry-point success. Production aggregate exports are unconfirmed.

Next implement/test actual application DID verification with supported primitives
and public method authorization, or separately approve an SDK dependency change.
Preserve wallet/legacy behavior, test tampering/unpublished methods, and keep
unsupported status explicit. Do not activate server signing until this gate has
an evidence-backed outcome; status/rendering/external acceptance remain outstanding.

## Step 9: UI fix deployment pending — 2026-10-14

Approved commit `26b61bf280525215b9a6dc2e4d8dcfa0421978dc` pushed to main
contains only the issuance page proof-preservation change and its regression test.
Vercel reports deployment pending. Eighteen targeted tests and local worktree
production build/TypeScript passed before push; exact remote build is pending.

No server signing configuration activation or production issue/verify/view test.
Remaining API/tooling/report changes are still local. Confirm deployment before
activating the retained matching signing key under separate approval. Check
application verification's historical hardcoded loader assumptions for distinct
method IDs before claiming the new production credential verifies locally.
Public authorization already passed; status/rendering/external acceptance have not.

## Step 8: public deployment verified — 2026-10-14 12:06 +08:00

Vercel reports success for `7963ae63`. Both live well-known documents match the
retained public candidates byte for byte; the new P-256 method is assertion-
authorized and its live JWKS material matches. Public-first authorization gate
is complete. Signing configuration has not been activated.

Next: review and obtain deployment approval for pending runtime fixes, especially
the page's DID-proof preservation. They were not included in the public-only
commit, so production UI must not be assumed fixed. Coordinate separate approval
for activating the four server DID variables using the retained private file,
without printing/sharing it. Then perform synthetic production issue/verify/view
and legacy/auth acceptance; supported status/rendering and external acceptance
remain outstanding.

## Step 7: public-only push completed — 2026-10-14

Approved commit `7963ae63bd72e668a06cfd266f9c7a1b6275394c` pushed to `main`
contains only the static DID/JWKS files. Runtime fixes/tooling/tests and these
reports are still uncommitted locally and are not part of that deployment.
Vercel Git integration confirms deployment pending; GitHub Pages also triggered.
Initial live DID/JWKS checks still return historical documents without the new key.

Next: confirm Vercel deployment success and live candidate/public-key equality.
Do not activate server signing yet. If deployment fails, record exact logs and
choose a minimal correction without silently adding all local runtime changes.
Deploy/review the pending proof-preservation fix before production issue/download
acceptance; public authorization alone does not fix the old browser overwrite.

## Step 6: static files ready locally — 2026-10-14

The reviewed public candidates are now integrated into the repository static
DID/JWKS. Exact bytes/hashes match the retained step 5 candidates. Historical
entries are preserved; the new P-256 method is assertion-authorized without
changing historical authentication. Twenty-four targeted tests and production
build pass, including public DID/JWK correspondence and no-duplicate API handling.

No commit/push/deployment, environment changes or signing activation performed.
Do not regenerate keys or copy the secret file into the repository.

Next approved operation must be deployment preparation/execution through the
existing mechanism. Inspect current branch/worktree and account for all pending
runtime changes before selecting a deployment scope; do not silently deploy
unreviewed changes. After publication, check both live well-known documents
against the retained candidates and allow caches to propagate. Activate matching
server signing variables only under separate approval after public authorization
is confirmed. Status/rendering and external acceptance remain later steps.

## Step 5: retained deployment candidates reviewed — 2026-10-14

Supersedes earlier preparation-only/no-key-persisted checkpoints. User approved
actual key creation and review only. The retained owner-only directory is
`/Users/mmtelc/verifiable-did-2026-01`; method
`did:web:verifiable.sg#ecdsa-2026-01`. **Do not run the generator again for this
method.** `signing.env` is secret; the two candidate JSON files contain public
material only.

Live baselines matched checked-in DID/JWKS immediately before generation.
Retained candidate preservation, permissions, P-256 JWK/Multikey/private-key
correspondence and in-memory SDK sign/derive/verify checks all passed.

Reviewed public candidate SHA-256:

| Candidate | SHA-256 |
|---|---|
| `did.candidate.json` | `9d5fde43b9d483517e40c68e5993ac5c63b41a95c176b726c7d300bb9e3de070` |
| `jwks.candidate.json` | `42ac0154fbc4d62a73eb8a8b02f96c46b9437fb4cbcfbdb6be7f4bf06e11af76` |

Next, obtain approval to update the **repository public static files only** from
these reviewed candidates. Check hashes and current live baseline again before
publication; preserve historical entries and review the public-only diff.
Do not copy the secret file, change signing variables, commit/push or deploy as
part of that local review without the appropriate approval.

After publication/deployment approval and live resolution confirmation, obtain
signing-configuration activation approval. Existing public methods must remain.
Production static files/environment/routing have not changed in step 5.

## Step 4: static publication selected — 2026-10-14

User selected preparation of the static DID/JWKS path, keeping the existing
well-known URLs and avoiding API rewrites. Tooling is ready; no actual deployment
key or candidate files have been persisted. Twenty-four tests and production
build pass.

The existing generator now emits three files in a new private external directory:

- `did.candidate.json`: historical DID plus distinct P-256 assertion method.
- `jwks.candidate.json`: historical JWKS plus corresponding P-256 public JWK.
- `signing.env`: matching secret configuration; never publish or commit.

The documented generator command below now produces all three files. For custom
baselines supply both `--did-document` and `--jwks-document`, using reviewed current
public documents. The tool rejects JWKS ID collisions and never overwrites files.

### Coordinated static rollout (not executed; approvals required)

1. Approve creating the actual key, choose the distinct full method ID and new
   private external directory. Generate once and retain the protected secret file;
   do not use test keys or regenerate between public publication and activation.
2. Review both public candidates against the current production public documents.
   Confirm historical entries are unchanged, the new DID assertion references the
   exact method ID, and new JWKS key has its matching fragment and P-256 curve.
   Tool regression tests establish static/API equality for the same baseline/key.
3. With publication/deployment approval, update only the public static DID and
   JWKS from the reviewed candidates. Do not copy the private directory into git.
   Deploy public authorization first without changing existing signing variables.
   Existing API handlers may still report invalid legacy configuration until
   the separately approved signing configuration is corrected.
4. Fetch both public well-known URLs, account for redirect/cache propagation and
   confirm the newly authorized key bytes match the retained candidates.
5. Only then, with signing-configuration approval, set the four server DID variables
   from the retained secret configuration. Use literal full IDs in Vercel settings
   (the dotenv quotes are syntax, not part of the value); never use NEXT_PUBLIC
   private-key variables. Do not replace historical key IDs.
6. Reissue a synthetic credential; confirm its proof uses the new full method ID,
   verify using the publicly resolved document and run authorized issue/verify/view,
   legacy verification and authentication smoke tests. No recipient data upload
   to external hosted verifiers without disclosure consent.
7. If rollout fails, stop new issuance and investigate. Do not remove the new
   public method after it has signed credentials. Retain historical and newly used
   public methods even if signing configuration must be rolled back.

This completes preparation only; live DID validity and external acceptance are
still unverified. Supported revocation/status and external rendering remain later
compatibility steps, not solved by adding public keys.

## Step 3: API implementation ready; rollout gated — 2026-10-14

The DID/JWKS APIs now use a shared server-only public-key parser/document builder.
P-256/P-384 Multikeys publish as Multikey DID methods plus correctly labeled JWKs;
legacy secp256k1 hex parsing validates complete points. Historical public methods
and relationships are preserved, conflicts fail explicitly, and full-body ETags
prevent old documents being served with new-key validators.

Twenty-four regression tests and production build/TypeScript pass. No static
publication, production env or rewrite changed. Without configured public key,
APIs return unchanged historical documents (not a new validity claim).
Malformed configured IDs/keys yield logged 503/no-store. In particular, the
observed local key ID without a fragment is not deployment-ready.

**Next rollout decision requires approval:** publish the reviewed static candidate
or route the actual well-known URL to the corrected API. An API-only update is
not a live did:web fix. Preserve historical methods, publish the new distinct
public method first, confirm public resolution, then activate matching server
signing configuration. No new private material has been persisted.

## Step 2 prepared workflow — 2026-10-14

User approved preparation/testing only. No existing environment, public DID,
JWKS, contract or production configuration was changed.

The existing JS generator now produces supported P-256 Multikey material; the TS
entry delegates to it. It no longer emits incorrectly sliced secp256k1 coordinates,
untyped base58 secrets or unquoted dotenv fragments. Tests use temporary keys,
not deployment keys. All existing public DID methods are preserved in the candidate.

After separate rollout approval, an operator can prepare an actual key with:

```sh
node scripts/generate-did-keys.js \
  --output-dir "$HOME/verifiable-did-next" \
  --key-id 'did:web:verifiable.sg#ecdsa-2026-01'
```

The directory must not exist, its parent must exist, and it must be outside this
repository. Generated `signing.env` is secret (0600); **never commit, paste into
chat, expose as NEXT_PUBLIC variables or publish it**. `did.candidate.json` contains
only public material plus preserved existing methods. The command does not deploy,
set Vercel variables or replace any existing files.

Before rollout:

1. Review candidate method ID, curve, controller and preserved historical entries.
2. Resolve static `/.well-known/did.json` versus API DID/JWKS publication
   inconsistencies; the current API helpers do not handle multibase keys correctly.
   Publishing only to the API is not publishing the actual did:web document.
3. Arrange a coordinated, reviewed publication/configuration change: add the new
   public assertion method before signing with it; retain historical `#key-1`.
   Use quoted dotenv values locally and literal full values in Vercel settings.
4. Validate public DID resolution and proof with the published key, not a
   private/local-loader override, then perform authorized production smoke tests.
5. Continue supported status and external renderer work separately.

Tests: **23 PASS**, including keypair correspondence, real app signing against a
candidate DID with a distinct method, SDK derive/verify, legacy wallet/rendering,
secret file permissions and collision/overwrite protection. Production build:
**PASS**. Candidate/test success is not public DID or external-verifier acceptance.

## Step-by-step remediation checkpoint — 2026-10-14

Supersedes the pending-input state and provisional verdict below. Actual supplied
artifacts fail tested reference requirements; see the current compatibility reports.

1. **Completed locally:** preserve the single-issuance API's DID-signed credential
   instead of overwriting its proof with MetaMask. DID-only no longer needs a
   wallet; failed/unsigned API responses are explicit errors. Separate Ethereum
   signing remains unchanged. Seventeen targeted tests and production build pass.
2. **Next:** trace public signing-key publication and compare the existing signing
   public key with the published DID. Do not disclose private key material, replace
   historical key IDs or change production configuration without review/approval.
3. **Later, separately approved:** supported status and external-renderer profiles,
   then fresh-artifact reference verification and consented hosted acceptance.

No new credential fields, DID changes, key rotation or deployment in step 1.
Production auth, persistence, issue/verify/view acceptance still requires an
authorized live smoke test; local handler/SDK/rendering tests are not a substitute.

## Authoritative continuation plan — 2026-10-14

**This section supersedes the draft below. Do not implement its speculative
wrapper names, proof removal, Token Registry requirement or unreachable-context
fallback assumptions.** JSON-LD processors must resolve referenced contexts; they
do not safely ignore unreachable URLs.

Current verdict: TradeTrust **PARTIAL**, OpenCerts **PARTIAL**. See the
[TradeTrust report](./TRADETRUST_COMPATIBILITY_REPORT.md) and
[OpenCerts report](./OPENCERTS_COMPATIBILITY_REPORT.md) for source revisions,
per-field checks, risks and live read-only infrastructure observations.

### Preservation gates

- No production auth, Supabase, Resend, DID document, DNS, contract, environment
  or SDK upgrade in this continuation.
- No edits to existing signed documents; no removing revocation/status checks
  to manufacture a successful result.
- Do not repoint or replace `#key-1`. If new cryptographic material is needed,
  retain historical keys and add a distinct method ID after approval.
- Defaults and existing aliases remain unchanged. Any new interoperable profile
  must be separately opt-in and versioned; do not silently remap `w3c`/`v1`.
- Do not deploy contracts or spend funds until the intended profile and existing
  contract inventory prove a deployment necessary.

### Phase A — exact evidence and local regression (completed)

- [x] Resume audit reports and distinguish historical sample from real production JSON.
- [x] Compare current W3C and OA profiles with upstream source.
- [x] Reproduce cryptographic failure when signed content is altered after signing.
- [x] Prepare existing application commitment before signing; produce actual
      bytes32, avoid caller mutation and avoid adding it to unrelated status types.
- [x] Remove duplicate `0x` from new status IDs.
- [x] Local issuance/derived-proof verification/view/tamper/legacy-wallet tests:
      7 passing tests; TypeScript PASS; production build PASS.
- [x] Public DID, DNS TXT, Sepolia code and store ABI read probes.

### Phase B — production fixtures and verifier baseline (next, blocked on input)

- [ ] Receive fresh OpenCerts-mode certificate and known-good legacy certificate.
      User offered to provide these; neither received yet. Keep them local and
      out of git.
- [ ] Verify each unmodified file on verifiable.sg with authorized access.
      Capture format, fragment outcomes and verifier versions without recipient data.
- [ ] Verify issuer/proof public key using the public DID, not the local
      environment-derived loader override.
- [ ] Obtain explicit approval before uploading certificate contents to external
      TradeTrust/OpenCerts sites, or perform isolated local reference verification.
- [ ] Inventory actual production SDK version and key format. Local
      `@trustvc/trustvc@0.0.0` exports no aggregate verifier functions; do not
      equate a local SDK build with the working production environment.

### Phase C — opt-in W3C interoperability (requires design/rollout approval)

1. Select a supported revocation profile. Ordinary non-transferable certificates
   should evaluate Bitstring Status List; do not drop revocation silently.
2. Define literal certificate-category mapping with legacy reader fallback.
   Current human-readable strings in JSON-LD `type` can fail signing.
3. Stage a pinned maintained TrustVC API adaptation, with issuer identity and
   document-status fragment tests that fail closed for invalid/error results.
4. If needed, add an appropriate public verification key under a new ID; retain
   all old keys and continue verification of old documents.
5. Add W3C `renderMethod` only once a protocol-compliant renderer is available,
   without changing current local certificate templates.

Gate every change on issuance, cryptographic verification, view, actual legacy
verification, format JSON checks and `npm run build`. Do not enable the new
profile by default until external verification passes for agreed versions.

### Phase D — infrastructure reconciliation (no deployment approved)

- Configured Sepolia address has bytecode, but tested `isIssued`/`isRevoked`
  calls revert. DNS binds another address which currently returns no code on
  Sepolia. Identify both contracts/network/ownership before making changes.
- Correct registration config/default-address/signer-runner handling and add
  receipt/outcome tracking only behind a tested opt-in operational flag.
- If OA export is actually required, use maintained OA wrapping/hash/proof
  tooling in a separate output profile; preserve existing W3C issuance.
- A Document Store is relevant to OA DNS-TXT issuance, but must have matching
  roles, network, wrapping/commitment, receipt, DNS binding and revocation tests.
- A Token Registry is for transferable records, not a prerequisite for ordinary
  OpenCerts/TradeTrust certificate verification. Do not deploy one for this task.

### Phase E — controlled live acceptance

- [ ] Production Issue Certificate succeeds with an authorized test issuer.
- [ ] Production Verify Certificate succeeds and reports actual status/identity.
- [ ] Production View Certificate succeeds.
- [ ] Actual legacy certificate still verifies and renders unchanged.
- [ ] OpenCerts-mode JSON matches the selected supported profile.
- [ ] Agreed TradeTrust/OpenCerts reference versions verify and render the file.
- [ ] Registration/login/reset/email/DID smoke tests pass without changing their configuration.
- [ ] Final `npm run build` PASS, explicit rollback gate, then approved deployment.

**Stop condition:** no compatibility PASS claim while fixtures, status semantics,
public-key match, chain linkage or external verification are unresolved.

---

## Historical draft — superseded, retained for continuity

Generated: 2026-08-10
Status: Draft v1.0

---

## Overview

This document outlines the phased migration of `certificate-issuer` to support TradeTrust and OpenCerts-compatible certificate issuance alongside existing W3C Verifiable Credential flow. The goal is **zero regression** for existing API consumers while enabling OA-mode certificates on-demand.

### Guiding Principles

1. **Zero backward-incompatible changes** — existing `/api/certificates` callers see no difference unless they opt in.
2. **Feature-flag driven** — a `certificateType` request parameter controls output format per-request.
3. **Reuse existing infrastructure** — DID document, JWKS, Document Store, TrustVC signing all stay unchanged; only the *output payload* changes.
4. **Configuration-first approach** — constants in `lib/constants.ts` already contain most required values; minimal new code.

---

## Phase 0: Discovery & Validation (Week 1)

**Status**: In Progress

- [x] Analyzed `lib/trustvc.ts` (lines 1114–1572) — verified `buildVCPayload`, proof builders, and signing interfaces
- [x] Confirmed DID document at `did:web:verifiable.sg` already contains OpenCerts-compatible structure
- [x] Identified existing `OPENCERTS_CONTEXTS` constant in `lib/constants.ts` (lines 684–702)
- [x] Completed GAP_ANALYSIS.md

**Deliverable**: This migration plan, plus the gap analysis above.

---

## Phase 1: Configuration & Constants (Week 2 — Low Risk, No API Changes)

### Scope

Prepare all constants and configuration for OA-mode without touching runtime code paths.

### Tasks

#### 1.1 Verify `OPENCERTS_CONTEXTS` completeness

Location: `lib/constants.ts`, lines 684–702

**Action**: Review and confirm these URLs are sufficient for both OpenCerts v2.1 and TradeTrust spec:
```typescript
// Already present — review required
export const OPENCERTS_CONTEXTS = [
  "https://www.w3.org/2018/credentials/v1",
  "https://www.w3.org/ns/did/v1",
  "https://w3id.org/security/suites/ecdsa-secp256k1-2019",
  "https://trustnetic.com/trustvc/contexts/context.json",
  "https://opencredentials.github.io/long-term-archive/contexts/opencerts/opencerts-v2.1.jsonld",
  "https://opentrust.org/schema/dss/format/1.0/context.jsonld",
  "https://ts.openattestation.com/comprobante/1.0/context.json"
]
```

**Acceptance criteria**: All URLs resolve; all JSON-LD schemas load correctly via a smoke test.

#### 1.2 Add new constants (if needed)

If any context URL or type tag is missing:
- `OPENCERTS_CREDENTIAL_TYPE = "OpenAttestationDocument2018"`
- `OPENCERTS_SUBJECT_TYPE = "OpenAttestationCredentialSubject"`
- `OPENCERTS_PROOF_TYPE = "OpenAttestationAssertion2018"`
- `OPENATTACKATION_SIGNATURE_TYPE = "OPENATTACKATION_JSON_LD_PROOF"`
- `OPENCERTS_SIGNATURE_FORMAT = "OpenAttestationSignedDocument"`

#### 1.3 Add Token Registry ID constant (if applicable)

```typescript
export const TOKEN_REGISTRY_ID = "0x..." // from OpenCerts deployment
```

---

## Phase 2: Dual-Mode Credential Builder (Week 2–3 — Medium Risk)

### Scope

Add `certificateType` parameter to credential issuance without breaking existing callers.

### Tasks

#### 2.1 Add enum / type for certificate modes

**Location**: `lib/constants.ts` or `types/certificate.ts`
```typescript
export type CertificateMode = "standard" | "opencerts";
```

#### 2.2 Modify credential builder to accept mode parameter

**Locations**:
- `lib/trustvc.ts` — `buildVCPayload()` signature: add `mode?: CertificateMode`
- `src/routes/certificates/` — pass mode from request body

**Changes in `buildVCPayload()` for OA mode**:
```typescript
if (mode === "opencerts") {
  payload["type"] = [...payload["type"], OPENCERTS_CREDENTIAL_TYPE];
  payload["credentialSubject"]["_type"] = "OpenAttestationCredentialSubject";
  const oaContexts = getOACredentialContexts();
  payload["@context"] = [...payload["@context"], ...oaContexts];
}
```

**Recommendation**: Only add OA fields in OA mode. Minimizes diff and keeps standard-mode output pristine.

#### 2.3 Add OA-specific proof/wrapper builder

**Location**: `lib/trustvc.ts` — new function (do NOT modify existing proof builders)

```typescript
function buildOpenAttestationProof(payload, privateKey, didUrl) {
  // Sign the OA wrapper payload with the same keypair
  // Return signature (OPENATTACKATION_JSON_LD_PROOF) + credentialSignature wrapper
}
```

#### 2.4 Wire into API endpoint

**Request body addition**:
```json
{ "recipient": { /* existing */ }, "certificateType": "opencerts" }
```

The `certificateType` field is **optional**. Default behavior (no field = `"standard"`) preserves backward compatibility.

#### 2.5 Add OA wrapper to signed payload

After signing, if `mode === "opencerts"`:
- Remove the W3C `proof` block
- Add `signature`, `signatureFormat`, `credentialSignature` fields
- Optionally add `openCertsCertificateMetadata` with token registry ID




---

## Phase 3: Document Store Commitment Integration (Week 4 — Medium Risk)

Link the on-chain Document Store commitment into the proof layer for TradeTrust compliance.

### Tasks

#### 3.1 Restructure signing flow to support in-line commitment

New OA-mode flow:
```
buildVCPayload() → signDIDCertificate() → hashForDocumentStore() 
                   → commitToDocumentStore() 
                   → addCommitmentToProof() 
                   → return final OA certificate
```

**Key change**: Commitment from `commitToDocumentStore()` fed back into proof layer:
```typescript
proofObject["commitment"] = commitmentHex; // 32-byte hex string
```

#### 3.2 Ensure verification API handles OA mode certificates

Update `/api/verify-certificate` to:
1. Detect if incoming certificate uses OA format (check for `signature` field)
2. Use appropriate verifier (OA verifier for OA certs, native verifier for standard certs)
3. Return unified response schema with `"format": "opencerts" | "standard"` field


---

## Phase 4: Cross-Compatibility & Validation (Week 5 — Low Risk)

### Tasks

#### 4.1 Add OA-specific fields to standard mode (optional enhancement)

Add `_type` markers and OA contexts even in standard mode so the certificate can be parsed by OA tools while remaining valid for W3C verifiers.

> Per W3C VC spec, unknown `@context` URLs must be ignored if unreachable. Only add when both contexts are resolvable.

#### 4.2 Add validation script

Create `scripts/validate-opencerts.ts`:
```bash
pnpm run validate:opencerts <path-to-certificate.json>
```

#### 4.3 Add OpenAttestation revocation check to verification API

Wire existing `revokeCertificateOnChain()` into the OA verification result.


---

## Phase 5: Testing & Deployment (Week 6 — Controlled Rollout)

### Tasks

#### 5.1 Unit tests
- [ ] Test `buildVCPayload()` in both modes produces correct output
- [ ] Test OA wrapper builds correctly
- [ ] Test proof integration includes commitment
- [ ] Test backward compatibility (standard mode unchanged)

#### 5.2 Integration tests
- [ ] Issue an OA-mode certificate via `/api/certificates`
- [ ] Verify it with the OpenCerts reference verifier (https://verify.opencerts.me)
- [ ] Verify revocation is reflected correctly
- [ ] Test DID resolution still works

#### 5.3 Staging deployment
Deploy to staging, issue test certificates, validate with:
1. OpenCerts Verify frontend (`https://staging.verify.opencerts.me`)
2. TradeTrust verifier tools
3. W3C credential verification libraries (ensure standard certs still work)

#### 5.4 Production rollout
- [ ] Merge to main after staging validation passes
- [ ] Monitor error logs for both certificate types
- [ ] Update API documentation with `certificateType` parameter


---

## File Changes Summary

| File | Change Type | Phase |
|------|------------|-------|
| `lib/constants.ts` | Add/type constants | 1 |
| `lib/trustvc.ts` | New OA proof builder; modify `buildVCPayload` | 2 |
| `src/routes/certificates/*.ts` | Pass mode from request body | 2 |
| `src/services/document-store.ts` | Return commitment to caller | 3 |
| `src/services/trustvc.ts` (verify) | Detect OA vs standard format | 3 |
| `src/verify-certificate.ts` | Dual-mode verification logic | 3 |
| `scripts/validate-opencerts.ts` | New validation script | 4 |


---

## Risk Mitigation

### Risk: Breaking existing API consumers
**Mitigation**: `certificateType` is optional with `"standard"` default. No fields are removed from standard output.

### Risk: OA context URLs unreachable in production
**Mitigation**: Test all context URLs from the deployment environment before Phase 2. Have fallback/resolver URLs ready.

### Risk: Document Store commitment fails mid-flow
**Mitigation**: Keep current behavior where signing succeeds independently of document store commit. In OA mode, if commitment fails, fall back to standard format and log a warning.

### Risk: Dual-proof confusion for verifiers
**Mitigation**: In OA mode, remove the `proof` block entirely (do not keep both). The `signature` + `credentialSignature` fields serve as the proof.


---

## Acceptance Criteria for Full Migration

1. [ ] `/api/certificates` accepts `certificateType: "opencerts"` and returns valid OA certificate
2. [ ] Default behavior (`certificateType` omitted) produces identical output to pre-migration
3. [ ] OA-mode certificate validates against https://verify.opencerts.me
4. [ ] Standard-mode certificate still validates with native verification API
5. [ ] Document Store commitment is visible in OA proof layer
6. [ ] Revocation of OA certificates is reflected in verification result
7. [ ] All existing tests pass
8. [ ] New unit + integration tests added and passing
