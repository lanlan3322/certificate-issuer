# OpenCerts compatibility report

Updated: 2026-10-14  
Overall: **PARTIAL — external verification and rendering not proven**

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
