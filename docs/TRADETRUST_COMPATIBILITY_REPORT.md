# TradeTrust compatibility report

Updated: 2026-10-14  
Overall: **PARTIAL — not externally certified**

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
