# AUDIT_PROGRESS.md

Last Updated: 2026-10-20

## Vercel disabled-registration warning — 2026-10-20

- User confirmed the disabled-registration response came from hosted Vercel.
  The response reports the active deployment's registration flag, not the local
  environment configuration. Vercel settings were not accessed or changed.
- Replaced the misleading failure state with an explicit skipped-registration
  warning. Unknown response statuses remain errors; actual transaction failures
  retain their existing error handling.
- Fixed the submit-button wallet gate for DID+Ethereum to match the server-side
  registration flow. Ethereum-only issuance still requires a connected wallet.
- Added disabled-response/no-transaction and scheduled/disabled/unknown UI
  regressions. All 25 targeted tests and production build/TypeScript pass.
- Documented server-only Vercel configuration and redeployment requirements in
  the compatibility report. No secrets were printed or transactions broadcast.

## Supported TrustVC profile and hosted upload-gate check — 2026-10-20

- Implemented the user-approved persisted W3C status-list issuance profile across
  single and batch DID issuance. DID+Ethereum uses signed DID/list semantics plus
  separate optional server-side blockchain registration metadata, without requiring
  MetaMask or embedding an unsupported store status in the credential.
- Optional registration retains selected profile store routing, persisted hash and
  existing submitted/confirmed/failed transaction audit events. The UI labels work
  as scheduled, not confirmed. Signed status-list revocation does not depend on
  optional blockchain registration; historical signed-hash revocation is preserved.
- The actual `https://trustvc.io/` upload accepted an ephemeral-key synthetic
  Bitstring-profile JSON and reached DID/status-list resolution. Deliberately
  unresolvable `.invalid` fixture URLs produced expected retrieval failures and
  "Document has been tampered with", not the original format rejection.
  This is upload-gate evidence only, not a hosted verification pass.
- No recipient document upload, production-key use, new database issuance,
  transaction broadcast, authentication change or DID change was performed.
- Production rollout requires existing status-list configuration/migrations and
  fresh authenticated issuance. Old signed downloads need reissuance, not editing.
  See the compatibility report for prerequisites and remaining acceptance gates.
- Final validation: 59 focused regressions pass; webpack production build and
  TypeScript pass; whitespace check passes; 282 generated build files contain no
  matches for configured secrets. Local availability checks found status lists
  disabled, no status-list origin, and no Supabase URL/service-role configuration.
  Therefore real persisted issuance and full hosted verification remain blocked;
  hosted environment configuration was not inspected or changed.

## Downloaded credential validation and RPC correction — 2026-10-20

- Inspected the latest two user-directed Downloads JSON files locally; no
  credential contents were uploaded. The newest download (modified 09:00:47 UTC)
  passes signature, published DID authorization and Document Store checks.
  Its signed hash
  `0x86f94a9128faa28a04dadb895aced32a448b7c19a2903c8e0f91ccff5511bf35`
  is issued and not revoked. The earlier 08:48:46 UTC download's signed hash
  `0x460e24f7ae6ab9646deb8c8f88531c73af2929eda747bf12e3a50c9234d7fbd3`
  is not issued; its rejection remains correct.
- `https://rpc.sepolia.org` failed with SERVER_ERROR from this environment.
  The configured private RPC and `https://ethereum-sepolia-rpc.publicnode.com`
  both read the newest hash successfully. Updated the shared default to the
  working public endpoint and reused it in the registration service. Explicit
  server RPC configuration still takes precedence. Hosted environment settings
  and server logs were not inspected, so the precise production failure is not
  claimed as proven.
- The exact newest downloaded certificate verified with the application verifier
  using its updated default endpoint, without a provider override. Status errors
  now log only operation stage, validated ethers error code, chain name and public
  contract address, never raw provider errors or credential-bearing RPC URLs.
- Installed TrustVC W3C SDK derivation and signature verification pass on the
  newest document. Executed the pinned upstream W3C status selector at
  `25007968939db4c40231fcfea8b426e33892e6d9`: it rejects this
  `OpenAttestationDocumentStore` status on both original and derived documents.
  The selector accepts BitstringStatusListEntry / StatusList2021Entry only.
  The installed aggregate `@trustvc/trustvc@0.0.0` exports no verifyDocument.
- External compatibility remains a format/profile issue, separate from the RPC
  fix. Do not remove signed status fields or mark external verification passed.
  A future compatible export needs an approved supported W3C status-list profile
  or a separate genuine OpenAttestation artifact, rather than relabeling this JSON.
- Validation: exact latest download passes with the updated default RPC; 29
  focused regression tests pass; webpack production build and TypeScript pass.

## Application verification of signed Document Store status — 2026-10-20

- The ECDSA verifier previously accepted Bitstring status lists only, producing
  `credentialStatus: unsupported` even after successful signature/issuer checks
  for the application's `OpenAttestationDocumentStore` entries.
- It now accepts one well-formed store entry with a proof-covered bytes32
  targetHash and checks `isIssued`, then `isRevoked`, against that signed store.
  Unissued, revoked, malformed, wrong-network or unavailable status remains
  invalid. Unknown/mixed status types remain unsupported. Recipient data and
  signed credentials are not rewritten.
- Historical unqualified `did:ethr:<address>#...` references retain Sepolia
  semantics. Explicit Sepolia/mainnet references are accepted; new mainnet
  payloads include the network qualifier. RPC endpoints come only from trusted
  application configuration, never credential-provided URLs.
- Dual DID/Ethereum issuance now anchors the same DID-signed credential used for
  persistence/download rather than a separate wallet-signed payload. The store
  comes from the signed status reference. Active hashes already registered by
  the platform skip another transaction and display an already-registered state;
  revoked hashes are rejected. Ethereum-only wallet signing remains available.
- Existing dual-issuance downloads can still be unregistered if the prior wallet
  transaction anchored a different hash and platform registration failed. This
  correction does not mutate, re-sign or backfill historical documents.
- This is application-level status support, not proof of TradeTrust/OpenCerts
  acceptance. No live credential or blockchain transaction was created here.
- Validation: 52 focused credential/store/issuance/UI/revocation regressions pass.
  `npm run build -- --webpack` and TypeScript pass. Hosted verification of the
  user's specific downloaded certificate remains pending deployment.

## Delegated-wallet transaction failure — 2026-10-20

- Failed Sepolia transaction
  `0xcd6d3d3534409378df807cfc18f1a5ff1e25d6dae428c25163c903558a55f301`
  has receipt status 0 at block 11954103. It is a type-4 EIP-7702 transaction
  to `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`, not a direct store call.
- Decoded `redeemDelegations(bytes[],bytes32[],bytes[])` calldata contains the
  correct store `0x814D9c222D3b5A8282e0467Fa12b24C057731dD6` and
  `issue(0x510ce14e6b17e650fe05df959f981a9657a7a766a5be8407424327c0f84dbfd0)`.
  Thus the different outer destination does not establish an application
  address-selection bug. The wallet now has EIP-7702 delegation code.
- Read-back confirms the wallet has ISSUER_ROLE and the failed hash is not
  issued. The exact direct issuance simulation currently passes. Historical
  wrapper replay fails against block 11954102 state but passes against block
  11954103 state, after the account delegation became active.
- Failed transaction gas limit was 411657, gas used 211901. A subsequent
  wrapper estimate was 414564 and direct estimate 135482. These observations
  do not establish out-of-gas as the historical root cause. Nested debug traces
  are unavailable through the configured provider; the precise wrapper revert
  remains unproven.
- No further grant or issuance transaction was sent. Next diagnostic: retry the
  failed Ethereum operation with a fresh wallet estimate, or disable optional
  wallet smart/delegated transaction routing and use a direct store transaction.
  Do not change account delegation or permissions automatically.

## Ethereum wallet issuance SDK correction — 2026-10-20

- Fixed wallet issuance and revocation simulations to use ethers v6
  `contract.issue.staticCall(hash)` / `contract.revoke.staticCall(hash)`.
  The old v5 `contract.callStatic` property was undefined; its resulting
  TypeError was incorrectly presented as a possible permission failure.
- Successful receipts now use v6 `receipt.hash`, and missing/failed receipts
  return explicit errors instead of success-shaped results.
- The shared browser default now points to the dedicated Sepolia store rather
  than the old demo store. Profile-specific server overrides and historical
  signed store references are unchanged. The connected wallet still needs the
  appropriate on-chain role and Sepolia ETH; no roles are granted by this fix.
- Regression coverage includes the installed ethers Contract reaching the wallet
  request after simulation, successful receipt hash reporting, rejected prechecks,
  absent/reverted receipts, and duplicate/revoked feedback. No live wallet
  transaction was sent for this correction.

## Dedicated Document Store integration — 2026-10-20

- Local `DOCUMENT_STORE_ADDRESS` now selects the dedicated Sepolia store and
  `ENABLE_DOCUMENT_STORE_REGISTRATION=true` enables post-response registration.
  Deployments must set these server environment values separately; this change
  does not update hosted environment settings.
- Unmapped templates use the service's default store in both the signed payload
  and saved credential snapshot. Mapped issuer profiles retain their own store
  address/network. Historical signed certificates and snapshots are unchanged.
  The no-environment fallback now reuses the existing shared constant, replacing
  a malformed duplicated service address.
- Issuance now persists the signed `targetHash` in `credentials.document_hash`.
  Next.js `after()` replaces the untracked promise, with a 120-second route
  duration and 60-second confirmation wait. Registration failures do not turn a
  successfully issued credential into an API failure.
- The existing `audit_logs` records `credential.registration_submitted` with
  txHash immediately after broadcast, followed by `credential.registered` or
  `credential.registration_failed`. Metadata includes the external ID, targetHash,
  store address/network and result. No migration is needed. These writes use the
  existing request-scoped AuditService/RLS path and its explicit error logging;
  they are not an atomic transaction with the blockchain. Hosted database
  persistence has not yet been exercised.
- `DOCUMENT_STORE_PRIVATE_KEY` remains the preferred runtime signer. On Sepolia,
  `SEPOLIA_DEPLOYER_PRIVATE_KEY` is also accepted; it is never used as a fallback
  on other networks. The restored signer matches the requested admin, is funded,
  and has issuer/revoker roles. A dedicated least-privilege runtime signer can be
  configured later after role grants.
- Live service smoke: synthetic targetHash
  `0xf38bd46595f00e668ccd324a3857ba9cad0a0e4ba0a9c0712f25cbfd7f52b130`
  registered by transaction
  `0xa8560857d4a47784aa9c53b587ba72d4f6cfca11ab86a5dd6fed8c23cdf5f87a`,
  block 11953781. Receipt status 1; subsequent `isIssued` returned true, and a
  repeated registration skipped broadcasting. Estimated fee was checked below
  0.001 Sepolia ETH. This was a service-only smoke, not an issued certificate,
  and it did not write a credential or database audit event.
- Validation: 18 focused issuance/registration/revocation/status-list tests pass; production
  build and TypeScript pass. After restoring the existing dependency patches,
  full `node --test` discovery reports 119/121 passing. Remaining unrelated
  failures: `app/overview.test.js` expects three action cards, and
  `scripts/test-opencerts.ts` has an extensionless import unsupported by direct
  Node execution. The status-list issuance mock was updated for the new helper.
- Remaining gates: local Supabase configuration is absent and the browser has no
  signed-in issuer session. Authenticated issuance, actual audit-row read-back,
  fresh download/view/verify and TradeTrust portal acceptance remain unperformed.
  `after()` is lifecycle-managed but not a durable retry queue: host termination,
  route timeouts or audit write failures still require reconciliation using the
  saved targetHash and submitted transaction metadata. No auth or DID code changed.
- Secret-safety check: tracked diffs contained no configured secret values.
  Turbopack had cached local environment contents in three generated binary files;
  the identified versioned cache directory was removed with user approval.
  Final verification used `npm run build -- --webpack`; build/TypeScript and all
  18 focused tests passed. The final tracked diff and webpack output scan found
  no configured secret values. Future builds with local secrets must repeat this
  check or disable filesystem build caching.

## Dedicated Document Store deployed — 2026-10-20

- Sepolia contract: `0x814D9c222D3b5A8282e0467Fa12b24C057731dD6`.
- Transaction:
  `0xbcdab3e41b4c31a943e7586f911e6b49daa115863d39164dcd8cc752da034fbb`.
  Receipt status 1, block 11953698, gas used 850749; three confirmations
  observed during verification.
- Name: `Verifiable Document Store`. Requested admin
  `0x6A3473F78a727cbaC41c438bDB08F8189F00dBc2` has DEFAULT_ADMIN_ROLE,
  ISSUER_ROLE and REVOKER_ROLE, all independently read from the deployed contract.
- Method: factory `deployCreate2Clone(address,bytes)`, the same atomic clone and
  initialization flow as upstream `deploy:ds`. Broadcast used an in-memory
  ethers signer, not the interactive npm wrapper or private-key CLI arguments.
  Secrets were loaded from the local environment file without printing them.
- Audited implementation runtime bytecode exactly matched the compiled
  `DocumentStoreInitializable` artifact. The new contract has 45 bytes of clone
  code referencing that implementation. All 44 upstream Document Store tests
  passed before broadcasting.
- The simulated address differed from the mined clone address. The final address
  above was obtained from the successful receipt's factory/initialization logs,
  then verified through code, name and role reads. No second deployment was sent.
- Prior secret-access blocker below is resolved for this deployment by the user's
  locally supplied environment. The integration update above records subsequent
  local configuration/service validation; hosted acceptance remains pending.

## Dedicated Document Store deployment audit — 2026-10-20

Historical pre-deployment findings; deployment and local integration updates above
supersede the access and deployment blockers recorded in this section.

- The supplied `/private/tmp/document-store` contained empty source, Git and
  broadcast directories. No original failing command or receipt was available.
  Audited a separate checkout of `TrustVC/Document-Store` at
  `51f408f45400dd6c124214ffd7f19d5bb7c6c887`.
- `DeployBase.s.sol` calls both salt getters in its constructor. Consequently,
  `SALT_DOCUMENT_STORE`, `SALT_TRANSFERABLE_DOCUMENT_STORE` and
  `DEPLOYER_ADDRESS` are required even for ordinary and upgradeable store
  deployment. Missing/zero entropy, missing deployer or identical salts prevent
  script construction before broadcasting. Without the original error output,
  these are confirmed prerequisites, not a proven historical failure diagnosis.
- `foundry.toml` resolves Sepolia through `API_KEY_INFURA`.
  `bin/deploy.sh` sources `.env`, uses `DEPLOYER_ADDRESS`, and prompts with
  `-i 1` unless Ledger is configured. It does not automatically consume
  `SEPOLIA_RPC_URL` or `SEPOLIA_DEPLOYER_PRIVATE_KEY`.
- Read-only Sepolia checks (chain ID 11155111) found bytecode at factory
  `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` (11,838 bytes),
  DS implementation `0xdF6514554ffE0ccD1BeA3470e9F06B377101A3da`
  (7,429 bytes), and TDS implementation
  `0xF8b2A0C86A945C618a771917Ea8B967464f461f5` (11,235 bytes).
  Factory `computeCreate3Address` and DS `name()`/ERC-165 calls succeeded.
  Bytecode presence/API probes do not prove byte-for-byte implementation identity.
- Recommended ordinary flow: `deploy:ds` clones the existing DS implementation
  through the factory and initializes the requested name/admin atomically.
  `deploy:ds:upgradeable` instead deploys a UUPS implementation and ERC1967 proxy;
  it adds upgrade authority and is not required for the stated objective.
  If factory identity cannot be established, a direct constructor deployment
  avoids the shared script constructor/factory but must first be simulated.
- Requested admin: `0x6A3473F78a727cbaC41c438bDB08F8189F00dBc2`.
  The contract uses DEFAULT_ADMIN_ROLE, ISSUER_ROLE and REVOKER_ROLE, not
  Ownable. Initialization grants all three to the admin. A distinct runtime
  signer needs explicit issuer/revoker grants before app registration can work.
- OpenClaw metadata confirms both requested names exist as `secret` entries.
  Its supported CLI states secret-kind values are write-only; no supported
  signing/runtime injection interface was supplied. No secret values were
  extracted and no deployment or role-grant transaction was sent.
- Integration is blocked on deployment. Current issuance invokes `registerHash`
  without awaiting a durable worker and discards its transaction hash.
  This can lose work on serverless shutdown; success/failure and txHash need
  durable recording before this meets the requested registration contract.
  Authentication, DID handling and application integration were not changed.
- No new contract address, transaction hash, fresh issued certificate or
  TradeTrust acceptance result is claimed. Next gate: approved OpenClaw
  execution/injection mechanism, deployment simulation and cost check, broadcast,
  receipt/code/admin verification, then scoped integration and end-to-end tests.

## Step 26: certificate QR codes open the verifiable.sg verifier

- QR codes previously encoded the bare `/verify` URL (or `{"id": ...}` JSON on
  the issue preview), so scanning opened an empty verifier.
- `lib/site.ts` `buildVerificationUrl` now produces
  `https://<origin>/verify/?id=<certificate id>`; used by the verify View
  modal, gallery, embedded renderer (`/renderer/`) and the issue preview.
- `/verify/?id=` auto-verifies via `POST /api/verify { externalId }`: the
  issuer's stored copy is checked cryptographically plus DB status and expiry,
  and the page shows ID, status and validity dates only (no recipient data).
- Public lookup now uses the service-role client
  (`CredentialService.findForPublicVerification`) because RLS hid every
  credential from anonymous visitors (production returned `not_found`). This
  also makes pasted credentials honour DB revocation/suspension for anonymous
  verifiers. The response still excludes recipient details.
- Gallery maps camelCase `credentialSubject.certificateId` (the stored
  `external_id`) as the entry ID.
- First deploy found the record but reported "Missing required field:
  @context": issuance writes `JSON.stringify(credential)` into the JSONB
  column, so rows hold a JSON string. `lib/stored-credential.ts`
  `parseStoredCredential` now normalises rows to objects in
  `CredentialService` (gallery and revocation already accepted both shapes).
- Tests: `lib/site.test.js` added; 44/44 pass; `next build` passes.

## Step 25: retire exposed key `#ecdsa-2026-01`

- User approved retirement (certificates signed before the 17:29 switch were
  test-only or will be reissued).
- Removed `#ecdsa-2026-01` from `public/.well-known/did.json` (verificationMethod
  and assertionMethod) and `jwks.json`. `#key-1` and `#ecdsa-2026-02` remain.
- `lib/did-publication.ts` now refuses (503) to publish the retired key ID or
  public key, even if stale Vercel environment values return.
- Tests updated: the retired key is absent and env values that point to it are
  rejected. 42/42 PASS; build PASS. Production confirmation pending deployment.
- Effect after deploy: credentials signed with `#ecdsa-2026-01` fail
  verification everywhere.

## Step 24: signing key rotation to `#ecdsa-2026-02`

- Reason: earlier signing key material for `#ecdsa-2026-01` was exposed.
- Generated a new P-256 key with `scripts/generate-did-keys.js` into
  `~/verifiable-did-2026-02/` (outside the repo, 0700/0600). The secret was never
  printed or committed.
- Published only public material: added `#ecdsa-2026-02` to
  `public/.well-known/did.json` (verificationMethod + assertionMethod) and
  `jwks.json`. `#key-1` and `#ecdsa-2026-01` are kept so existing certificates
  still verify.
- Local check: the new secret signs ecdsa-sd-2023 and verifies against the new
  `did.json`. 42/42 tests PASS; build PASS.
- Rollout order: (1) deploy the DID document and confirm production lists
  `#ecdsa-2026-02`; (2) set the Vercel `DID_KEY_ID`, `DID_PUBLIC_KEY_MULTIBASE` and
  `DID_PRIVATE_KEY_MULTIBASE` values from `signing.env` and redeploy; (3) issue
  and verify a test certificate signed by `#ecdsa-2026-02`.
- 2026-10-14 17:31: production DID lists `#ecdsa-2026-02` (apex, www, API) with
  the matching public key. Vercel env switched; a newly issued certificate
  (proof created 09:29:29Z) is signed with `#ecdsa-2026-02` and the user
  confirmed it verifies on hosted TradeTrust and TrustVC.
- Open risk: while `#ecdsa-2026-01` stays in `assertionMethod`, whoever holds
  the exposed key can still sign credentials that verify. Removing it requires
  reissuing the certificates it signed.

## Step 23: TrustVC-compatible status list encoding

- User report: TradeTrust and TrustVC show "document is invalid" for
  `certificate-New.json`. Pinned TrustVC reference fragments: signature VALID,
  issuer VALID, W3CCredentialStatus ERROR (`encodedList cannot be decoded`).
  Any ERROR fragment makes the whole document invalid.
- Cause: `@trustvc/w3c-credential-status@2.5.0` encodes and decodes bare
  base64url, but our lists had the W3C Multibase `u` prefix.
- Decision (user): publish bare base64url (`lib/bitstring-status.ts`). The app
  verifier accepts both forms; a leading `u` is unambiguous because bare gzip
  base64url always starts with `H4sI`. Lists are generated and signed per
  request, so existing Bitstring certificates are fixed with no reissue.
  Trade-off: strict W3C Multibase verifiers may reject the list encoding.
- Tests: TrustVC `StatusList.decode` accepts published lists; prefixed lists
  still verify in the app; 42/42 PASS; build PASS.
- 2026-10-14 17:16: deployed; user confirmed `certificate-New.json` verifies as
  valid on the hosted TradeTrust and TrustVC verifiers.

## Step 22: CORS for browser verifiers

- User-reported TradeTrust error: fetch of `https://verifiable.sg/.well-known/did.json`
  from `https://ref.tradetrust.io` blocked by CORS. Cause: every hop must carry
  CORS headers. (1) Vercel domain redirect `verifiable.sg` -> `www` (308, no
  CORS); (2) Next trailing-slash redirect on signed status URLs (308, no CORS);
  (3) status-list 200 responses had no `Access-Control-Allow-Origin`.
- Code fix: `skipTrailingSlashRedirect` with equivalent 308 slash redirects in
  `proxy.ts`, except public verifier paths (`/api/status-list/`,
  `/api/.well-known/`, `/.well-known/`), which are served at their signed URLs
  without a redirect or Supabase call; API verifier paths add
  `Access-Control-Allow-Origin: *`. Verified locally; 42/42 tests and build PASS.
- Required dashboard fix (not possible in code): `did:web:verifiable.sg` and the
  signed status URLs use the apex domain, so `verifiable.sg` must serve
  Production directly instead of redirecting to `www`. Keep `www` serving too
  (renderer URL).
- 2026-10-14 17:05: apex redirect removed in Vercel. Production check with
  `Origin: https://ref.tradetrust.io`: DID document, both status lists and
  renderer return 200 with `Access-Control-Allow-Origin: *` on apex and `www`.

## Step 21: renderer origin fix after deployment

- Production test (synthetic VC only, local penpal host, same `connectToChild`
  call shape as TradeTrust `useFrame`, no `childOrigin`): `https://verifiable.sg/renderer/`
  308-redirects to `www`, so penpal rejects the handshake (`ConnectionTimeout`);
  `https://www.verifiable.sg/renderer/` CONNECTED, sent UPDATE_TEMPLATES and
  UPDATE_HEIGHT and rendered.
- Signed `renderMethod[0].id` changed to `https://www.verifiable.sg/renderer/`.
  Any certificate already issued with the apex renderer URL cannot be changed
  (signed field) and should be reissued with the renderer option.
- Classic template no longer renders empty quotes when description is empty.

## Step 20: opt-in embedded renderer and signed renderMethod

- Added static public `/renderer/` page implementing the TradeTrust/OpenAttestation
  embedded-renderer frame protocol (penpal v6 `connectToParent`, host actions
  `RENDER_DOCUMENT`, `GET_TEMPLATES`, `SELECT_TEMPLATE`, `PRINT`; frame sends
  `UPDATE_TEMPLATES` and `UPDATE_HEIGHT`). Site chrome is hidden on this route.
  Reuses the existing local templates; no new serverless function (8 API entry
  points, 10 dynamic route handlers plus proxy).
- `/api/issue` accepts `renderMethod: "none" | "embedded"` (default none;
  invalid values or non-DID issuance return 400). Embedded adds the bundled
  render-method context v2 and `renderMethod[0] = {id: https://www.verifiable.sg/renderer/,
  type: EMBEDDED_RENDERER, templateName}` before signing; `/renderMethod` is a
  mandatory ecdsa-sd pointer so `[]`-pointer derivations still disclose and
  protect it. Issue form exposes an opt-in checkbox for DID issuance.
- Existing certificates and default issuance are unchanged. New dependency:
  `penpal@6.2.2` only (lockfile entries inserted without dropping `libc` data).
- Validation: 42/42 tests PASS (JSON-LD expansion, signing, `[]` derivation,
  application verification with published-key loader, tampered renderer URL
  fails, view mapping/rendering, route opt-in/validation); `next build` PASS with
  `/renderer` static. Local iframe smoke test with penpal `connectToChild`
  rendered a synthetic VC and received template/height messages.
- Not yet verified: hosted TradeTrust/OpenCerts rendering (requires deployment
  and a fresh opt-in issuance). TradeTrust status remains the upstream Step 19
  ERROR. No commit, deployment or production write in this step.

## Step 19: fresh production artifact upstream fragment execution

- Executed TrustVC reference revision
  `25007968939db4c40231fcfea8b426e33892e6d9` integrity, status and issuer
  fragment implementations on the unchanged Step 18 artifact, using actual
  installed runtime dependencies and live public resolution. Node 24.9.0,
  require(ESM) disabled. No fragment mocks or recipient uploads.
- `EcdsaW3CSignatureIntegrity`: selected, VALID after derivation.
  `W3CIssuerIdentity`: selected, VALID.
  `W3CCredentialStatus`: selected, ERROR on both entries:
  `Invalid encodedList: encodedList cannot be decoded`.
- Root cause reproduced independently: installed status SDK 2.5.0 directly
  base64url-decodes Multibase `u`-prefixed encodedList before gzip expansion.
  Both original live lists fail with `incorrect header check`; unsigned
  diagnostic copies with only the prefix removed decode with index 3 false.
  This copy experiment is not signature verification of modified lists.
- Preserve W3C Multibase output and fail-closed application checks. Do not strip
  signed fields, remove statuses or call this hosted verifier acceptance.
  Compatibility blocker belongs to this reference/installed dependency
  combination; exact hosted dependency behavior remains untested.
- External rendering remains separate and untested. No application changes,
  production writes, key operations, commit or deployment in this step.

## Step 18: user-reported production issue/verify/view success

Fresh artifact subsequently obtained from the active editor:
`/Users/mmtelc/Downloads/certificate-Laurence9.json`, SHA-256
`1aca57166136b617ba26e691d7d589c561eec8ef80d8dea5c97ec1ed44f2be25`.
Local verification of the unchanged production download with live public
resolution **PASS**: ecdsa-sd-2023 signature, issuer assertion authorization,
both signed status-list proofs and active index 3. Independent installed W3C SDK
full-disclosure derivation/cryptographic verification also returns verified true.
Only public DID/context/status URLs fetched; recipient JSON never uploaded.

Artifact top-level type is only VerifiableCredential; it is not the OpenCerts-
marker profile tested earlier. No renderMethod, OA issuers collection,
openAttestationMetadata or wrapped Merkle proof present. Bitstring profile
intentionally has no targetHash or Document Store linkage; those are not required
for this DID-only W3C profile. External aggregate/hosted verifier acceptance still
unrun: do not relabel this SDK result as TradeTrust/OpenCerts full PASS.

- 2026-10-14 15:55 +08:00: user reported deployment complete and successful
  Issue Certificate, Verify Certificate and View Certificate tests.
  Local HEAD is `24fb22f1` (`build error`), containing sequential patch fixes.
- Record these as user-reported production acceptance, not independently
  inspected deployment logs. Subsequent downloaded-proof verification is
  recorded above; upstream fragment execution is recorded in Step 19.
  Do not claim hosted external PASS based solely on application success.
- Production suspend/reinstate/revoke and historical/auth/reset regression checks
  have not been reported in this checkpoint. Previously exposed signing key
  still requires controlled replacement before real credential issuance.
- No application changes or production operations performed in this checkpoint.

## Step 17: patch installation failure reproduced and repaired

- Reported Vercel postinstall failure for the combined VC patch. Downloaded the
  exact locked 2.4.2 registry tarball into isolated session storage and verified
  its SHA-512 against the lockfile. Combined patch applies to pristine package.
- Applying the earlier namespace-only patch first and then the combined patch
  reproduces the reported failure. This establishes a cached old-patch failure
  mode; the failed Vercel filesystem itself has not been inspected.
- Replaced the combined VC patch with two ordered patch-package patches:
  `+001+namespace-interop.patch` preserves the original fix;
  `+002+dynamic-imports.patch` adds the ESM repairs independently.
  The issuer patch and application behavior remain unchanged.
- Actual patch-package application passes on clean registry extraction,
  old-namespace-patched extraction and current fully patched installation.
  Added an offline regression covering those three states and checking the
  resulting SDK files match. **41 tests PASS** with require(ESM) disabled on
  Node 24.9.0; production build/TypeScript PASS.
- No workspace dependencies deleted, no secrets accessed, and no commit,
  push or deployment performed. Next: deploy sequential patches; choose a
  cache-free Vercel redeploy if other stale dependency state remains. Confirm
  issuer patch plus both numbered VC patches succeed before synthetic issuance.

## Step 16: persistent dynamic-import fix for production ERR_REQUIRE_ESM

- User reported the same issuance failure after the runtime pin. Implemented
  persisted patch-package fixes instead of relying on native require(ESM).
- Issuer BBS/ECDSA key helpers use dynamic imports. VC cryptography initializes
  through shared asynchronous imports; presentation helpers no longer eagerly
  require ESM; suite mapping is initialized before verification. Existing VC
  namespace patch retained. No signing material accessed or fields changed.
- Reverse/reapply of both version-specific patches PASS. Existing postinstall
  applies them to fresh deployment dependencies. Package upgrades must rebase
  these patches; do not disable Vercel installation scripts.
- **40 tests PASS** under Node 24.9.0 with require(ESM) disabled, including real
  synthetic sign/derive/verify/status lifecycle and wallet/rendering regressions.
  Production build/TypeScript PASS under the same disabled-interoperability
  condition. The build emits a Tailwind TS configuration warning but completes.
- No commit, push, production configuration change or live issuance performed.
  Next: deploy these patches, check postinstall success, retry synthetic issuance
  and verify/view. Separate exposed-key rotation remains required before issuing
  real credentials.

## Step 15: reported production ERR_REQUIRE_ESM — runtime fix validated locally

- User reported issuance failure requiring Digital Bazaar BLS Multikey from
  TrustVC's CommonJS BBS helper. Reproduced that exact package/error locally
  with `node --no-experimental-require-module`.
- User approved pinning/testing Vercel-supported Node 24 instead of maintaining
  multiple upstream interop patches. Added `engines.node: "24.x"` and matching
  lockfile metadata. No credential fields, application handlers or keys changed.
- Official Node 24.9.0 macOS binary downloaded outside the repository and checked
  against its published SHA-256. Actual context/VC SDK imports, synthetic
  signing/status verification, legacy/UI/router/database tests and production
  build pass under that runtime: **39 tests PASS**, TypeScript/build PASS.
- Added runtime interop regression tests. Vercel runtime-pin semantics and
  NODE_OPTIONS checks documented in the migration plan. Production runtime/flags
  remain uninspected; a deployment using the pin is needed before claiming a fix
  in production. No commit/push/configuration change performed in this step.
- Earlier user confirmed migration table plus three RPCs exist, and reported
  redeployment after signing/status configuration. Public DID key authorization
  passed; status endpoints returned 404 before first allocation. This does not
  prove that signing succeeded. Real-data issuance remains blocked separately
  pending replacement of the key exposed in editor context.

Next: deploy the runtime pin, confirm Node 24 with require(ESM) enabled, then
retry authorized synthetic DID-only opt-in issuance and verify/view. Retain
separate key-rotation and external-acceptance gates.

## Step 14: Hobby API function-budget audit — 2026-10-14

- Audited all 22 API route entry points and both external auth callback routes.
  Removed three unused SDK/database diagnostics; no test, compatibility or
  migration-diagnostic API routes were present.
- Consolidated 14 existing handlers into authentication, agent and business
  routers. Original URLs, handlers, bodies, cookies, authorization, tenant
  scoping and rate limits are preserved. All moved handler implementations are
  byte-for-byte identical; issue/verify/view, static DID/JWKS and auth callbacks
  remain unchanged.
- Build now has **8 API routes and 10 dynamic App Router route handlers**,
  conservatively 11 functions if proxy is counted separately: below 12.
  This is verified from the actual Next production manifest, not a hosted
  Vercel Build Output count. Vercel deployment remains pending.
- **37 tests PASS**, production build/TypeScript PASS; local production HTTP
  route/error/auth-gate/static-publication checks pass with synthetic Supabase
  settings. Local dynamic DID publication/status configuration gates remain
  explicit 503 responses, not claimed successes. No production auth/email/DB
  operations, migration/config activation, commit, push or deployment performed.
- Full before/after inventory, removed/consolidated files and validation limits:
  [API_ROUTE_AUDIT.md](./API_ROUTE_AUDIT.md).

Next: approve commit/push of the route consolidation, confirm hosted deployment
and actual function inventory, then resume authorized production verification.
The status migration and signing enablement remain separately gated.

## Step 13: production-verification commit approved — 2026-10-14

- User approved committing all pending changes for production verification,
  including the earlier DID publication/key-generation fixes, application ECDSA
  verification and opt-in status profile, tests, migration and reports.
- Pre-commit validation repeated: **31 tests PASS**, production build/TypeScript
  **PASS**, whitespace check clean. Checked all 27 pending files for secret paths
  and obvious embedded credentials; none detected. Retained private signing
  material remains outside the repository and is not included.
- Commit approval does not establish production verification. No push,
  production migration, signing/feature activation or authenticated production
  issue/verify/view performed in this step.

Next: push the approved commit for Vercel deployment when authorized, confirm
deployment, and execute the staged migration/configuration and production
verification gates in `docs/MIGRATION_PLAN.md`. External acceptance remains
unverified; original supplied-artifact failures remain unchanged.

## Step 12: opt-in signed status lists implemented and tested locally — 2026-10-14

- User explicitly approved an **opt-in signed Bitstring Status List profile**,
  permitting new status fields for newly opted-in credentials only. Existing
  documents, default issuance, wallet signing and legacy status remain unchanged.
- Single-issuance UI/API accepts `statusProfile: "bitstring"` only for persisted
  DID-only issuance. Default/omitted profile is legacy; bulk is unchanged.
  Feature requires `ENABLE_BITSTRING_STATUS_LIST=true` and an HTTPS
  `STATUS_LIST_BASE_URL` origin matching the issuer did:web domain.
- Added unapplied migration `database/migrations/006_bitstring_status.sql`:
  durable unique never-reused indices, 131072-bit pages, service-role-only
  allocation/snapshot/atomic revocation functions. Missing/unpersisted/deleted
  credentials fail closed. Revoked credentials cannot be reinstated; suspension
  can be reinstated. Failed logging rolls back the whole transition.
- Public `/api/status-list/{page}/{revocation|suspension}` publishes signed
  VC v2 lists without recipient/tenant identifiers, with 60-second validity and
  `Cache-Control: no-store`. Failure returns 503, not an unsigned or empty list.
  Status bits are derived from persisted credential state on each publication.
- Application verifies both signed lists, exact issuer authorization, origin,
  allocation, purpose, subject, TTL and dates. Decoding is bounded to 16 KiB.
  Suspended/revoked/unavailable/tampered lists fail; mixed Ethereum profiles
  cannot bypass on-chain checks. Base-proof verification now discloses all
  submitted top-level properties rather than silently omitting them.
- Installed status package 2.5.0 has a broken native ESM entry and returns bare
  base64url. Use its CommonJS implementation and add the required `u` Multibase
  prefix. Independently checked gzip bytes/bit order against W3C requirements:
  https://www.w3.org/TR/vc-bitstring-status-list/#bitstringstatuslistcredential.
  This is wire-format evidence, **not external TradeTrust/OpenCerts acceptance**.
- Added direct existing status dependency and PGlite dev-only migration testing;
  exclude the test engine from API production traces. No SDK upgrade.
- **31 tests PASS**: real cryptographic issue/verify/view and legacy fixtures,
  revoke/suspend/reinstate, freshness/tampering/encoding/size/profile rejection,
  isolated API/service/UI boundaries, embedded PostgreSQL allocation/rollover,
  privileges and atomic rollback. Production build/TypeScript **PASS**.
  DB tests use a disposable in-memory PostgreSQL engine and schema fixture,
  not live Supabase. No authenticated production/auth/email smoke test claimed.
- No migration applied, signing/feature activated, private deployment key read,
  commit/push or deployment performed. All step 11–12 runtime changes stay local.

Next: review/approve the runtime deployment and additive migration separately;
configure the retained signer and status origin only with explicit approval.
Then run authorized synthetic production issue/verify/view, revocation lifecycle
and legacy/auth smoke checks. External rendering and hosted/reference-verifier
acceptance remain blocked/pending; original supplied-artifact FAIL is unchanged.
Do not re-scan earlier completed analysis or edit historical signed artifacts.

## Step 11: application ECDSA verification implemented locally — 2026-10-14

- Added a dedicated `DataIntegrityProof` / `ecdsa-sd-2023` path to the actual
  `lib/trustvc.ts::verifyCredential` entry point using installed `@trustvc/w3c-vc`.
  No dependency installation/upgrade or credential-field changes.
- Default verification loader resolves public issuer documents, not the signing
  environment's hardcoded historical key. Requires exact issuer/method DID match,
  assertion proof purpose, matching resolved DID ID and an explicitly authorized
  method controlled by the issuer. Pins the method from that resolved document.
- Verifies derived proofs directly; derives base proofs in memory before SDK
  verification. Does not mutate the submitted credential or remove signed status.
- Enforces validFrom/validUntil for this new path. Existing Ethereum registration
  requirement remains; wallet and other legacy branches remain unchanged.
- **Intentional safety gate:** any nonempty credentialStatus currently returns
  `valid: false`, `signatureVerification: verified`,
  `issuerAuthorization: verified`, `credentialStatus: unsupported` after successful
  crypto/authorization. No status type is falsely described as checked.
  Current builder emits OpenAttestationDocumentStore, so current new DID issuance
  still cannot satisfy full application verification. Do not remove the field
  or activate signing under an assumption this step solves revocation.
- Tests exercise the actual application function with a synthetic distinct
  method and isolated public-document loader: valid base/derived credentials
  without status pass; intact status gives explicit unsupported result; tampered
  subject/status, wrong issuer, unpublished/unauthorized method, resolution failure,
  expired and future-valid documents fail. Input remains unchanged.
- **24 tests PASS**, including earlier UI, SDK, static/API, generator, rendering
  and wallet regressions; production build/TypeScript **PASS**. These tests do not
  claim live production resolution or hosted acceptance.
- No private deployment key accessed, production configuration changed, commit,
  push or deployment performed. Changes remain local.

Next: inspect and select a supported revocation/status solution with preservation
gates, before signing activation. Deploy verification changes only under explicit
approval and with the fail-closed status behavior understood. Historical non-ECDSA
aggregate verification remains unchanged and still has the previously recorded
local empty-export limitation. External renderer and verifier acceptance remain.

## Step 10: UI deployment confirmed; verification activation gate blocked

2026-10-14 12:13 +08:00: independently confirmed Vercel success for UI commit
`26b61bf280525215b9a6dc2e4d8dcfa0421978dc`. This confirms deployment status,
not an authenticated issuance/download smoke test.

Followed the actual application verification path before activating signing:

- `app/api/verify/route.ts` delegates cryptographic checks to
  `lib/trustvc.ts::verifyCredential`.
- Its DID proof branch calls aggregate `verifyDocument`/`isValid` from
  `@trustvc/trustvc`. The installed package exports an empty object; both
  functions are absent. Earlier SDK tests exercised `@trustvc/w3c-vc` directly,
  not this aggregate application branch. Production package exports have not
  been inspected, so this is a confirmed local blocker, not an invented live error.
- The shared local loader hardcodes `#key-1` and captures its key at module load.
  It does not publish the new `#ecdsa-2026-01` method. Simply activating the new
  environment key cannot establish verification through this loader.
- Existing wallet verification takes a separate earlier branch and is not
  evidence that DID/DataIntegrityProof application verification passes.

No signing activation or runtime change in this checkpoint. Next fix must test
the actual application `verifyCredential` entry point with the new distinct
method and tampered/unauthorized proofs, preserve wallet/legacy behavior and
report unsupported status explicitly. Do not remove credentialStatus or accept
SKIPPED fragments to manufacture success. Scope approval is needed if choosing
a dependency upgrade versus using the existing supported cryptographic library.

## Step 9: UI proof-preservation fix pushed — 2026-10-14

- User explicitly approved committing/pushing the issuance page and its regression
  test only. Commit `26b61bf280525215b9a6dc2e4d8dcfa0421978dc` pushed to main:
  `app/insurance/page.tsx` and `app/insurance/page.test.js`.
- DID-only issuance preserves the API credential instead of overwriting its
  proof with MetaMask; requires a signed credential/proof and surfaces failures.
  Ethereum-only and mixed issuance retain separate wallet/anchoring behavior.
- Pre-push validation: **18 targeted tests PASS** (actual handler with isolated
  boundaries plus cryptographic/legacy/rendering regressions); production build/
  TypeScript **PASS** on the local worktree. API/tooling changes remain local;
  that full build is not proof of the exact remote deployment result.
- Vercel commit status **pending**, `Vercel is deploying your app`:
  `https://vercel.com/lanlan3322s-projects/verifiable/4wTnpdfK3Lh6nFUNWw1ouDYw53fo`.
  Do not describe the UI change as live until deployment is confirmed.
- Public-only authorization was already confirmed live in step 8. No signing
  variables/private key files changed and no authenticated production issuance run.
- DID/JWKS API fixes, generator/tooling, expanded SDK tests and reports remain
  uncommitted locally and are not included in this push.

Next: confirm this Vercel deployment succeeds. Then separately approve activation
of matching server DID configuration, without exposing secrets, and perform an
authorized synthetic issue/verify/view test plus legacy checks. Local verification
loader still has hardcoded historical method assumptions; inspect that path before
claiming verification of the new distinct production method. Status/rendering and
external acceptance remain unresolved.

## Step 8: live public authorization confirmed — 2026-10-14 12:06 +08:00

- User reported completed Vercel deployment. Independently confirmed commit
  `7963ae63bd72e668a06cfd266f9c7a1b6275394c` Vercel status **success**,
  `Deployment has completed`.
- Live DID and JWKS both return HTTP 200 after redirect to `www` and match the
  retained reviewed candidates **byte for byte**:
  DID SHA-256 `9d5fde43b9d483517e40c68e5993ac5c63b41a95c176b726c7d300bb9e3de070`;
  JWKS SHA-256 `42ac0154fbc4d62a73eb8a8b02f96c46b9437fb4cbcfbdb6be7f4bf06e11af76`.
- `did:web:verifiable.sg#ecdsa-2026-01` is now publicly assertion-authorized.
  Independently imported the live P-256 JWK and confirmed its exported Multikey
  matches the live DID method. No private material accessed in this check.
- Public publication gate **PASS**. Signing configuration is still unchanged;
  pending UI/API runtime fixes remain local, not deployed by the public-only commit.
- This does not establish fresh production issuance or external acceptance.
  Next: review/deploy the pending runtime proof-preservation changes, coordinate
  separately approved server signing activation, then run authorized synthetic
  production issue/verify/view checks. Do not expose signing.env or activate
  before accounting for the old production UI's wallet-proof overwrite.

## Step 7: public-only commit pushed; deployment pending — 2026-10-14

- User explicitly approved committing/pushing only the two public documents.
  Commit `7963ae63bd72e668a06cfd266f9c7a1b6275394c` is pushed to `origin/main`.
  It contains only `public/.well-known/did.json` and `jwks.json`.
- All pending runtime/tests/tooling/report changes remain uncommitted locally.
  Do not claim they are deployed with the public-key commit.
- Confirmed Vercel Git integration via commit status: pending,
  `Vercel is deploying your app`, deployment
  `https://vercel.com/lanlan3322s-projects/verifiable/2UUkt2TWmzHBA1CGXyGWuWrbtCzG`.
  No local Vercel CLI/project linkage was present.
- GitHub Pages workflow also triggered:
  `https://github.com/lanlan3322/certificate-issuer/actions/runs/38508761722`.
  Pages is not evidence of Vercel production success.
- Initial post-push live DID/JWKS checks returned HTTP 200 but neither contained
  the new method yet. Publication is **pending**, not confirmed.
- No signing variables, private key files or production services modified.
  Existing 24-test/build local validation remains applicable; no code changed
  during this public-only push.

Next: check Vercel commit/deployment status and both live public documents against
retained candidate hashes/keys. If deployment fails, collect exact build evidence
before changing anything. Never activate signing while public authorization is
pending. Pending UI proof-preservation fix must also be deployed before claiming
new production downloads retain issuer DID proofs.

## Step 6: reviewed static public files integrated locally — 2026-10-14

Following the user's instruction to proceed, updated only the repository public
DID/JWKS from the retained reviewed candidates; no commit, deployment or signing
activation performed.

- Immediately before integration, live DID/JWKS returned 200 and still matched
  the previous historical baseline. Both retained candidate hashes matched the
  step 5 review.
- `public/.well-known/did.json` now adds
  `did:web:verifiable.sg#ecdsa-2026-01` as a P-256 Multikey assertion method.
  Historical `#key-1`, assertion/authentication entries and services are unchanged.
- `public/.well-known/jwks.json` adds the corresponding P-256 public JWK.
  Both files match the reviewed candidate bytes and SHA-256 hashes exactly:
  DID `9d5fde43b9d483517e40c68e5993ac5c63b41a95c176b726c7d300bb9e3de070`;
  JWKS `42ac0154fbc4d62a73eb8a8b02f96c46b9437fb4cbcfbdb6be7f4bf06e11af76`.
- Added regression assertions for the actual retained public method: static
  DID/JWKS represent the same key; API configuration selecting this already
  present method neither duplicates it nor changes the static baseline.
- **24 tests PASS**, production build including TypeScript **PASS**, exact
  candidate byte comparison and historical-entry preservation **PASS**.
- Secret directory and signing environment were not edited or exposed.
  Production URL still requires deployment; no live acceptance claim.

Next: obtain deployment approval and inspect the existing deployment mechanism
before committing/pushing/deploying. Confirm the live public DID/JWKS resolve
these exact public keys after deployment/cache propagation. Only then separately
activate the matching server signing configuration. New credential issuance,
status/rendering compatibility and external acceptance remain outstanding.

## Step 5: actual deployment key generated and reviewed — 2026-10-14

User explicitly approved generating/retaining the actual key and reviewing its
public candidates, but not publication, deployment or signing activation.

- Created `/Users/mmtelc/verifiable-did-2026-01` once, outside the repository.
  Retain it; **do not regenerate** for this method ID.
- Method: `did:web:verifiable.sg#ecdsa-2026-01`, P-256 Multikey.
- Directory mode 0700; `signing.env`, `did.candidate.json` and
  `jwks.candidate.json` each mode 0600. Private material was not printed,
  copied into reports, committed or sent externally.
- Before generation, live DID/JWKS both returned HTTP 200 after redirect to
  `www`; parsed contents exactly matched repository preservation baselines.
- Reviewed retained candidates: historical DID methods/assertions/authentication/
  services and JWKS entries unchanged; one distinct new assertion method and
  corresponding P-256 JWK added; no secret appears in public candidates.
- Actual retained private/public key correspondence PASS by random challenge
  signing and independent JWK verification. SDK synthetic VC signing, derivation
  and verification against the retained candidate DID PASS. Credential/test
  signature remained in memory; no test certificate persisted or registered.
- Public candidate file SHA-256:
  - DID: `9d5fde43b9d483517e40c68e5993ac5c63b41a95c176b726c7d300bb9e3de070`
  - JWKS: `42ac0154fbc4d62a73eb8a8b02f96c46b9437fb4cbcfbdb6be7f4bf06e11af76`
- No runtime changes this step. Previous 24 regression tests/build remain the
  latest code validation; actual candidate checks above ran separately.
- Static public documents, production/local environment and routing unchanged.
  No deployment or authenticated production acceptance performed.

Next approval gate: copy **only the two reviewed public candidates** into static
well-known files, validate and review the diff. Publication/deployment requires
separate approval; activate server signing only after live public resolution
matches these retained candidates. Never copy/publish `signing.env`.
The new method is not publicly authorized yet. External status/rendering blockers
and hosted acceptance remain unresolved.

## Step 4: matched static publication preparation — 2026-10-14

User selected **prepare static DID/JWKS candidate publication**, not API routing
or production activation.

- Extended the existing key-preparation tool to emit `jwks.candidate.json` beside
  `did.candidate.json` and secret `signing.env`. Uses the installed Digital Bazaar
  public-key exporter rather than duplicating coordinate conversion.
- Both public candidates use the same generated P-256 key and distinct ID;
  all existing DID methods/relationships/services and JWKS entries are retained.
  Rejects collisions with either a fragment or full key ID in existing JWKS.
- Custom baseline CLI input requires both `--did-document` and `--jwks-document`;
  rejects malformed JWKS before generating/writing material.
- All three output files remain exclusive, owner-only writes in a new external
  directory. Repeated invocation cannot overwrite any candidate or secret.
- Tests assert static/API output equality, DID/JWK keypair correspondence,
  history preservation, quoted environment IDs, public/private separation,
  permissions and unchanged files after overwrite rejection.
- **24 tests PASS**; production build/TypeScript **PASS**; editor diagnostics none.
  Tests generated only temporary synthetic keys and cleaned up their output.
- No real deployment key/candidates were persisted; no public static files,
  production environment, routing, credentials or authentication changed.

Next: explicit approval to create the actual deployment key in a private
external directory, review both public candidates, then separately publish
public material before activating the matching private signing configuration.
Use the static rollout sequence in the migration plan. Never publish signing.env.
External acceptance and status/rendering remain unresolved.

## Step 3: API publication consistency — 2026-10-14

- Added server-only `lib/did-publication.ts`, shared by the existing DID/JWKS
  API routes. Both now extend the checked-in historical public documents with
  the configured public assertion method rather than independently inventing
  coordinates, curves or key IDs.
- Supports validated P-256/P-384 compressed public Multikeys and complete legacy
  secp256k1 hex points (with or without `04`). Publishes Multikey in DID and
  corresponding correctly labeled JWK in JWKS. Only public configuration is read.
- Preserves historical verification methods, assertion entries, authentication
  and services. Historical IDs cannot be repointed to different material.
  Existing matching methods are not duplicated.
- Removed the unused coordinate fallback parser from `did-utils.ts`; existing
  signing resolution remains unchanged. No new signing keys or credential fields.
- Removed stale process-level API caches. ETags are quoted SHA-256 hashes of the
  actual response body; conditional requests work on the first request as well
  as after key/config changes. Existing five-minute HTTP caching remains.
- Invalid configured keys/controllers/IDs yield a logged HTTP 503 with no-store,
  not a successful response with unrelated default coordinates.
  With no public key configured the API serves the unchanged historical public
  documents; this preserves history and does not claim the old key is valid.
- **Deployment gate:** the previously observed local ID without a fragment is
  intentionally rejected by these APIs. Reused `#key-1` with different material
  is also rejected. Do not deploy these handlers assuming old invalid
  configuration is corrected automatically.
- Tests: **24 PASS**, including actual route GET handlers (200/304/503),
  full-body ETag changes, P-256/P-384 conversion, hex point parsing, JWK/signing
  key correspondence, history preservation, invalid-key error logging and all
  earlier app issuance/legacy/rendering regressions. Build/TypeScript **PASS**.
  The editor runner still did not discover Node tests; explicit Node runner used.
- Static public DID/JWKS files, route rewrites, production env, auth and services
  remain untouched. No hosted acceptance or authenticated production smoke tests.

**Next:** review the candidate DID and coordinated rollout. The live did:web URL
still resolves the static file, not these APIs. Explicitly approve either
publishing the reviewed static candidate (retaining history) or routing the
well-known URL to the corrected API, then configure the matching distinct key
after public authorization is available. Do not activate either path implicitly.
External status/rendering compatibility remains unresolved.

## Step 2: prepare a preservation-safe DID key workflow — 2026-10-14

User approved **preparing and testing only**, not production key/config changes.

Findings from the existing publication/signing path:

- `/.well-known/did.json` is a static public file; the separate API DID/JWKS routes
  are not wired to replace it. Their helpers ignore multibase public keys and
  default to fixed coordinates, then declare every JWK as secp256k1.
- The old JS/TS generators used an uncompressed secp256k1 point but sliced x/y
  starting before its `04` point marker. They also base58-encoded raw secret
  bytes without the Multikey codec and reused `#key-1`.
- Local public material validates as secp256k1, not P-256. The local secret
  encoding is not a supported P-256/P-384 private Multikey header. No private
  bytes were displayed or copied into reports. Local configuration is not proof
  of the independently managed production environment.
- Parsed local `DID_KEY_ID` has no fragment. Regression testing also reproduced
  dotenv stripping unquoted `#fragment`; generated environment values are now
  quoted so method IDs round-trip exactly.

Prepared changes:

- Replaced existing `scripts/generate-did-keys.js` with a P-256 Multikey generator
  using the already installed Digital Bazaar library. The existing TS entry
  delegates to it rather than duplicating crypto logic.
- Requires a distinct full method ID; rejects collisions in historical DID
  verification relationships. Candidate preserves existing methods,
  authentication, services and assertion entries; adds only the new public
  Multikey method/context and assertion authorization.
- Writes `signing.env` and `did.candidate.json` only to an explicitly selected
  new directory outside the repository (0700 directory, 0600 files, exclusive
  writes). Does not print secrets or update existing configuration/public files.
- Only temporary synthetic keys were generated during tests and removed
  afterwards. No production replacement key was generated or persisted.

Validation: **23 tests PASS** across generator, page-handler and cryptographic
regressions. Includes actual application `signDocumentWithDID` with the prepared
distinct method, independent candidate-DID loader, SDK derivation/verification,
legacy wallet verification, rendering, permissions and overwrite rejection.
`npm run build`: **PASS** including TypeScript; changed generator files have no
editor diagnostics.

Next: review and approve public DID/API publication consistency and key
configuration rollout before creating a real replacement key. Preserve `#key-1`;
do not copy a test key or publish the secret environment file. Status/external
renderer blockers remain. Production issue/verify/view and hosted acceptance
have not been run.

## Step 1 fix: preserve the issuer DID proof — 2026-10-14

- User approved proceeding step by step. Fixed the single-issuance page's
  post-API wallet signing, which stripped and replaced the server DID proof.
  The page now retains the returned credential unchanged for preview/download.
- DID-only issuance no longer requires a connected wallet. Ethereum-only and
  combined issuance retain the existing separate wallet/anchoring flow.
- Unsigned, missing-credential, missing-proof, unauthorized and failed API
  responses surface an error; no wallet-signing fallback or unsigned draft
  is presented as a successfully issued DID certificate.
- Updated the page's misleading browser-side DID fallback notice. No credential
  fields, issuer key configuration, public DID, contract or auth flow changed.
- Added `app/insurance/page.test.js`, which transpiles and executes the actual
  page event handler and credential-selection expression with isolated HTTP,
  UI state and wallet boundaries. This is not a live authenticated browser test.
- Validation: `node --test app/insurance/page.test.js lib/trustvc.test.js`:
  **17 tests PASS**. Includes proof preservation, DID-only without wallet,
  mixed/Ethereum-only flows, failure responses, real SDK signing/derivation/
  verification, four template renderers and legacy wallet tamper detection.
  `npm run build`: **PASS**, including TypeScript. Editor diagnostics: none
  for the changed page/test. The editor test runner did not discover these
  Node tests; the explicit Node runner executed them successfully.
- Production issue/verify/view and external hosted acceptance were not run.
  Earlier supplied signed artifacts remain unchanged and retain their FAIL
  results. This fix affects newly issued credentials after deployment only.
- **Next step:** inspect how the existing server signing public key is published
  and compare public material with the actual DID document. Do not reveal private
  key material, repoint `#key-1`, rotate keys, or change production configuration
  without a separately reviewed preservation-safe plan. Status and external
  renderer compatibility remain later steps.

## Actual-artifact validation: 2026-10-14 11:22 +08:00

This section supersedes the attachment-access blocker and provisional PARTIAL
results below. No credential fields, runtime code, public DID, services or
production configuration changed. Original files remain unmodified in Downloads;
recipient details are not copied into reports or sent to external verifiers.

### Artifact identity

| File | SHA-256 of original file bytes | Observed format |
|---|---|---|
| `certificate-test6.json` | `9174eb41c3fe88003a6dbd511508225930375dac907921f1b0c2b48e8a0c4d2f` | OpenCerts-mode markers present |
| `certificate-tester7.json` | `933ff8e0138e2aca7610be3ff43e03cd4c25a67317445d356ab58beed49c30f9` | Standard-mode output; no OA type/subject marker |

### Compatibility result

- **TradeTrust requirements: FAIL** for both supplied artifacts.
- **OpenCerts requirements: FAIL** for both supplied artifacts.
- **OpenAttestation v2/v3 schema requirements: FAIL** for both supplied artifacts.
- Scope: local execution of installed W3C verifier, pinned reference verifier
  issuer check/selection predicates, upstream OA schemas and public DID checks.
  Hosted verifier uploads were **not run**. These are not invented hosted
  portal response messages.

### Reproduced evidence

1. `@trustvc/w3c-vc@2.4.2`: `isSignedDocument` returns `false` on both files;
   `verifyCredential` returns
   `{"verified":false,"error":"\"proof\" type is not of BbsBlsSignature2020."}`.
   Exact field: `/proof/type = EthereumPersonalSignature2024`. This is the
   installed validator's diagnostic, not a recommendation to switch to BBS.
2. Executed upstream TrustVC `w3cIssuerIdentity.verify` from revision
   `25007968939db4c40231fcfea8b426e33892e6d9` on both actual files:
   `ISSUER_IDENTITY / INVALID / "Issuer and verification method do not match."`
   `/proof/verificationMethod` is a wallet address; `/issuer` is
   `did:web:verifiable.sg`. No mocked issuer verification was used.
3. Executed the same revision's W3C signature/status selection predicates:
   both return false and their skip fragments return `SKIPPED`.
   The legacy signature predicate accepts BBS proofs; modern ECDSA/BBS predicates
   require `DataIntegrityProof`, not this wallet proof. Status entry type is
   `OpenAttestationDocumentStore`, not a supported W3C status-list entry.
   Only predicates were run for these fragments; no stubbed cryptographic
   verification was counted as evidence.
4. Upstream OA schemas at revision
   `f1339e9af90369ca621aaf1cc246bfcada7264ea`, validated locally with installed Ajv:
   OA v2 requires `/issuers`; OA v3 requires `/issuanceDate` and
   `/openAttestationMetadata`, and expects `/credentialStatus` to be an object.
   Both actual files fail these checks. These schema failures apply to OA
   profiles, not universal W3C VC v2 rules.
5. JSON-LD safe expansion **PASS** for both. EIP-191 `verifyMessage` recovers the
   claimed `signedBy` wallet for both. This proves wallet-message integrity,
   not supported W3C proof semantics or issuer authorization.
6. `/credentialStatus/0/targetHash`: bytes32 **PASS** and exact current application
   keccak commitment recomputation **PASS** for both. No certificate-specific
   on-chain issuance or OA Merkle proof was established.
7. Public DID HTTP **200**, redirect to `www`; issuer ID matches. Neither wallet
   proof method appears in published `verificationMethod` or `assertionMethod`.
   Independent validation of published `#key-1` secp256k1 JWK also fails:
   ethers: `bad point: equation left != right`;
   Node `ECDH.convertKey(..., "secp256k1")`:
   `Failed to convert Buffer to EC_POINT`. This does not change the already
   reproduced issuer-mismatch failure, which occurs before DID resolution.
8. Issuer is a DID string, not OA v2 `/issuers` metadata; neither file has
   `/openAttestationMetadata`, OA v2 wrapping envelope or W3C `/renderMethod`.
   Subject `$template` is a string, while the OpenCerts W3C renderer selector
   reads top-level `renderMethod[0].id`. No external renderer was exercised.

### Next unfinished action

The input-access blocker is resolved. The exact primary blockers are unsupported
wallet proof and mismatched issuer verification method, with independent status,
OA schema and public-key problems documented in both compatibility reports.
Do not relabel the proof or rewrite these files. First obtain a genuinely
issuer-DID-signed output from the existing DID issuance path using a supported
suite and an actually authorized, valid public key. Separately approve any
status/profile/DID configuration change; none is implemented here. Run hosted
verifier acceptance only with explicit consent to disclose recipient data.

## External validation checkpoint: 2026-10-14 11:13 +08:00

- Scope: external validation only; no new credential fields or runtime changes.
- User reports two JSON files attached to the chat, but neither attachment's
  content nor a readable attachment path is exposed in this session. A JSON
  listing of the workspace and session artifact folder exposed only existing
  project configuration, DID documents and historical audit samples.
- Do not substitute those historical samples or newly generated test credentials
  for the requested freshly issued production artifact.
- TradeTrust: **PARTIAL / fresh-artifact test NOT RUN**.
- OpenCerts: **PARTIAL / fresh-artifact test NOT RUN**.
- OpenAttestation: **PARTIAL / fresh-artifact test NOT RUN**.
- Exact failing field: **not established for the reported attachments**. Earlier
  source-based status-profile findings remain separate from an observed verifier
  failure on these files.
- DID resolution, verificationMethod, proof, credentialStatus, targetHash, OA
  metadata, issuer metadata and template metadata cannot be validated against
  an unreadable artifact. No external verifier execution/upload occurred.
- Next step: make the attachments readable to this session (local absolute paths
  or pasted JSON). Then record artifact identity, verifier/version, raw diagnostic
  and exact JSON path before recommending any runtime correction.

## Continuation checkpoint: 2026-10-14

This checkpoint supersedes the historical findings below and the August gap
analysis. Resume here; do not restart discovery. Reference source revisions and
field-level evidence are in [TradeTrust](./TRADETRUST_COMPATIBILITY_REPORT.md) and
[OpenCerts](./OPENCERTS_COMPATIBILITY_REPORT.md) compatibility reports.

### Current result

- **TradeTrust: PARTIAL.** Local W3C issuance, TrustVC derivation and signature
  verification pass. Current status profile is unsupported by the reviewed
  upstream W3C verifier. No fresh production certificate has been supplied or
  submitted to the reference verifier.
- **OpenCerts: PARTIAL.** Current OpenCerts supports a W3C verification path;
  an OA wrapper is not universally required. Local cryptographic checks pass,
  but status, public-key alignment and external rendering remain unresolved.
- Production registration/login/password reset/Supabase/Resend are user-reported
  working baselines, not newly exercised production tests. No changes to those
  systems, public DID files, production settings or contracts.

### Completed in this continuation

1. Read existing reports and existing sample; determined the sample is historical,
   not a freshly issued production artifact, and cannot prove compatibility.
2. Compared current payload and signing/status paths against TradeTrust docs,
   OpenCerts reference site and TrustVC reference verifier source.
3. Added a regression that verifies a disclosure derived from the **returned**
   signed certificate, rather than checking only that a proof exists.
4. Fixed local store commitment preparation: calculate bytes32 `targetHash`
   before signing, avoid ASCII-hex double encoding, do not mutate caller input,
   and do not inject the custom commitment into unrelated status types.
5. Removed duplicate `0x` from newly built status IDs.
6. Tested all four format aliases, serialized viewer mapping, all four React
   certificate templates, the legacy DID issuance entry point, legacy-style
   wallet verification, and rejection of tampered hashes/recipients.
7. Read-only public DID, DNS and Sepolia contract checks completed; no transaction
   submitted. The configured contract does not answer the expected store ABI.

### Verification evidence

| Check | Result | Scope |
|---|---|---|
| `node --test lib/trustvc.test.js` | PASS, 7 tests | Synthetic, temporary P-256 keys; 6 subtests plus parent |
| `tsc --noEmit --incremental false` | PASS | Full project |
| `npm run build` | PASS before and after code fixes | Next.js production build, 24 static pages |
| Issue / verify / view | PASS locally | Signing, disclosure verification and server rendering; not authenticated production API/database E2E |
| Previously issued production certificate | BLOCKED | User offered to provide fresh and legacy files; neither received yet |
| Public DID GET | PASS accessibility | Returns `did:web:verifiable.sg`, `#key-1`, secp256k1 JWK; redirects to `www` |
| Live external TradeTrust / OpenCerts upload | NOT RUN | Await certificate fixtures and explicit consent to external submission |

The new regression was also run against the original `HEAD` signing code in
memory, normalizing only the unrelated status-ID typo to isolate proof handling:
all four DID format cases and the legacy DID entry point failed with
`Invalid signature`, while the wallet case passed. The fixed working tree passes
the same tests. No baseline source file was overwritten.

### Exact deployment observations

- Sepolia RPC `eth_chainId`: `0xaa36a7` (11155111).
- Configured address `0x92600b6B5fE4D15D87d7d264C6cAdCcaf9D74594`:
  15,993 bytes of code; `name()` returns `Verifiable`; `isIssued(bytes32)` and
  `isRevoked(bytes32)` revert for a zero-hash read probe. Neither selector was
  found in the returned bytecode. This is not proof of the expected Document
  Store interface, nor proof that any certificate was issued.
- `_document-store.verifiable.sg` TXT:
  `openatts net=ethereum netId=11155111 addr=0x4B30674f8F77C0b1Ab4C8A34b2a85C295A3aE2D4`.
  This differs from configuration; `eth_getCode` for that address on Sepolia
  returns `0x`. No `openatts` TXT was observed at `verifiable.sg` itself.
- The server registration service's default address omits two hex characters,
  and its signer lookup uses ethers-v5 `.signer` rather than ethers-v6 `.runner`.
  This service was **not changed**; environment overrides and ownership must be
  established before enabling transactions.

### Next unfinished work

1. Receive fresh OpenCerts-mode and known-good legacy certificate files. Keep
   recipient data local; do not commit production certificates.
2. Compare actual proof key to the publicly resolved DID key; local loader
   overrides cannot establish external issuer identity.
3. Approve a separate, opt-in supported revocation profile (e.g. Bitstring Status
   List) and renderer integration. Do not silently remove status checks.
4. Inventory the actual contracts/network/permissions and reconcile DNS only
   after owner approval. **Do not deploy another contract or Token Registry.**
5. Test against the exact external verifier versions with consent, then rerun
   authenticated production lifecycle and legacy fixtures before rollout.

---

## Historical audit (retained for continuity; superseded above)

---

# Project Overview

## Production Site

- https://verifiable.sg

## Production DID

```text
did:web:verifiable.sg
```

## DID Document

```text
https://verifiable.sg/.well-known/did.json
```

Status:

✅ Publicly accessible

✅ HTTPS enabled

✅ DID resolves

✅ Verification methods published

✅ Assertion methods published

---

# Current Production State

## Authentication

### Registration

✅ Working

### Login

✅ Working

### Password Reset

✅ Working

### Resend Email

✅ Working

### Supabase Auth

✅ Working

### Email Verification

✅ Working

---

## Credential Lifecycle

### Issue Certificate

✅ Working

### Verify Certificate

✅ Working

### View Certificate

✅ Working

---

## Infrastructure

### Vercel

✅ Working

### Supabase

✅ Working

### Resend

✅ Working

### DID Resolution

✅ Working

---

# Technical Architecture

## Frontend

```text
Next.js
Vercel
```

## Identity

```text
did:web:verifiable.sg
```

## Authentication

```text
Supabase Auth
```

## Email

```text
Resend
```

## Credential Engine

```text
TrustVC
```

## Verification

```text
Native Verifiable Verification
```

---

# Current Credential Profile

Example observations from issued credentials:

## Issuer

```json
"issuer": "did:web:verifiable.sg"
```

Status:

✅ Correct

---

## Credential Type

```json
"type": [
  "VerifiableCredential"
]
```

Status:

✅ W3C VC

---

## Proof Type

```json
"type": "EthereumPersonalSignature2024"
```

Status:

⚠ Compatibility currently under review

---

## Verification Method

Current:

```json
"verificationMethod":
"0x..."
```

Expected TradeTrust-compatible form may be:

```json
"verificationMethod":
"did:web:verifiable.sg#key-1"
```

Status:

⚠ Compatibility analysis required

---

# Completed Work

## Phase 1

Authentication Stabilization

Status:

✅ Complete

Deliverables:

- Supabase Auth
- Registration
- Login
- Password Reset
- Email Delivery

---

## Phase 2

TrustVC Deployment Stabilization

Status:

✅ Complete

Deliverables:

- TrustVC package loading
- Issuance restored
- Verification restored

---

## Phase 3

DID Migration

Status:

✅ Complete

Previous DID:

```text
did:web:lanlan3322.github.io:certificate-issuer
```

Current DID:

```text
did:web:verifiable.sg
```

Result:

✅ Issuer updated

✅ DID published

✅ DID resolves

---

## Phase 4

Production Verification

Status:

✅ Complete

Deliverables:

- Credential verification working
- DID verification working
- Production deployment verified

---

# Active Audit Objective

Determine whether Verifiable-issued credentials are fully compatible with:

## TradeTrust

Status:

⚠ In Progress

Target:

```text
PASS
```

---

## OpenCerts

Status:

⚠ In Progress

Target:

```text
PASS
```

---

# Compatibility Review Checklist

## TradeTrust

### DID

✅ did:web support

### DID Document

✅ Published

### Verification Method

⚠ Review required

### Proof Format

⚠ Review required

### OpenAttestation Compatibility

⚠ Review required

### Document Store

❌ Not Confirmed

### Token Registry

❌ Not Confirmed

### On-chain Verification

❌ Not Implemented

---

## OpenCerts

### W3C VC Structure

✅ Present

### DID Issuer

✅ Present

### OpenAttestation Format

⚠ Review required

### Verification Compatibility

⚠ Review required

### OpenCerts Schema

⚠ Review required

---

# Current Open Issues

## Issue 1

TradeTrust Proof Compatibility

Status:

⚠ Investigation Required

Questions:

- Is EthereumPersonalSignature2024 accepted?
- Is DataIntegrityProof required?
- Is TradeTrust-compatible proof required?

---

## Issue 2

Verification Method Alignment

Current:

```text
Ethereum address
```

Potential target:

```text
did:web:verifiable.sg#key-1
```

Status:

⚠ Investigation Required

---

## Issue 3

Document Store Compatibility

Status:

❌ Not Implemented

Need to determine:

- Required?
- Optional?
- TradeTrust version dependency?

---

## Issue 4

Token Registry Compatibility

Status:

❌ Not Implemented

Need to determine:

- Required?
- Optional?
- TradeTrust version dependency?

---

## Issue 5

On-Chain Verification

Current:

```text
DID verification
```

Status:

✅ Working

Current:

```text
Blockchain verification
```

Status:

❌ Not Implemented

---

# Risk Assessment

## Authentication

LOW

## Issuance

LOW

## Viewing

LOW

## DID

LOW

## TradeTrust Compatibility

MEDIUM

## OpenCerts Compatibility

MEDIUM

## Blockchain Verification

HIGH

---

# Generated Reports

Pending:

```text
docs/TRADETRUST_COMPATIBILITY_REPORT.md
```

```text
docs/OPENCERTS_COMPATIBILITY_REPORT.md
```

```text
docs/GAP_ANALYSIS.md
```

```text
docs/MIGRATION_PLAN.md
```

---

# Next Steps for Compatibility

## Step 1

TradeTrust Compatibility Validation

Goal:

Determine whether current credential passes TradeTrust verification requirements.

Actions:

- Compare current VC against TradeTrust examples
- Validate proof format
- Validate DID usage
- Validate verificationMethod

Output:

```text
docs/TRADETRUST_COMPATIBILITY_REPORT.md
```

---

## Step 2

OpenCerts Compatibility Validation

Goal:

Determine whether current credential passes OpenCerts verification requirements.

Actions:

- Compare current VC against OpenCerts examples
- Validate OpenAttestation expectations
- Validate issuer requirements

Output:

```text
docs/OPENCERTS_COMPATIBILITY_REPORT.md
```

---

## Step 3

Verification Method Review

Goal:

Determine whether:

```text
verificationMethod = Ethereum address
```

should become:

```text
did:web:verifiable.sg#key-1
```

without breaking existing verification.

Output:

Compatibility recommendation.

---

## Step 4

Proof Format Review

Goal:

Determine whether:

```text
EthereumPersonalSignature2024
```

is acceptable.

If not:

- determine required TradeTrust/TrustVC proof type
- determine migration path

Output:

Compatibility recommendation.

---

## Step 5

On-Chain Verification Assessment

Goal:

Determine whether current implementation requires:

- Document Store
- Token Registry v4
- Token Registry v5

Actions:

- Compare against TradeTrust architecture
- Compare against TrustVC implementation

Output:

```text
docs/BLOCKCHAIN_VERIFICATION_PLAN.md
```

---

## Step 6

Gap Analysis

Classify:

LOW

MEDIUM

HIGH

for each compatibility issue.

Output:

```text
docs/GAP_ANALYSIS.md
```

---

## Step 7

5-Phase Migration Plan

Generate:

```text
docs/MIGRATION_PLAN.md
```

Phases:

1. Current State Preservation

2. TradeTrust Compatibility Mode

3. OpenCerts Compatibility Mode

4. Blockchain Verification

5. Unified Credential Strategy

---

# Recovery Instructions

If interrupted:

1. Read this file.
2. Do not re-scan repository.
3. Do not repeat completed phases.
4. Continue from the next unfinished compatibility step.
5. Update this file before continuing.

---

# Success Criteria

✅ Existing Verifiable functionality preserved

✅ TradeTrust compatibility assessed

✅ OpenCerts compatibility assessed

✅ Compatibility gaps documented

✅ Migration plan completed

✅ No regressions introduced

✅ Reports generated

✅ Future work clearly defined