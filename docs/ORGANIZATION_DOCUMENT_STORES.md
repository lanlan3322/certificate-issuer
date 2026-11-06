# Organization-owned Document Stores

## Architecture and signing flow

Issuer DID signing remains separate from Ethereum transaction authorization:

`Saved template -> issuer -> organization -> active Document Store -> register hash`

An approved organization store overrides the template identity profile's store
and platform default for new server-issued credentials. With no active store,
the existing profile/default selection and legacy wallet flow remain unchanged.
An active store whose connection test failed blocks issuance rather than silently
falling back.

The existing server transaction wallet is used; organizations grant its public
address `ISSUER_ROLE` and `REVOKER_ROLE`. No customer wallet secrets are collected,
no contract is deployed, and no new dependencies are introduced. New registry
entries are Sepolia only; historical network support is unchanged.

Organization-owned Ethereum issuance requires issuer DID signing, including in
single and batch issuance. The browser does not submit a second transaction.
Server registration is synchronous for an explicitly selected Ethereum method;
its confirmed transaction or explicit failure is returned separately from the
saved, signed credential. A submitted but unconfirmed transaction is not shown
as success. Failures are audited and the saved credential remains available:
do not blindly reissue after a timeout; reconcile the submitted transaction and
saved hash first. The legacy optional post-response registration path is retained.

`GET /api/issue?templateId=...` provides an authorized, uncached wallet-mode
preview. POST resolves the actual store again and never trusts client addresses.
The persistence trigger rejects a store switched during signing, before any
registration transaction is submitted.

## Schema and services

[Migration 021](../database/migrations/021_organization_document_stores.sql)
adds `organization_document_stores` with organization, network, lowercase contract
address, lifecycle status, platform approval, read-only connection-test result,
public server wallet address, actor and timestamps. Contracts are globally unique
per network; one store may be active per organization. Pending reservations
cannot be reassigned through the portal; operators must resolve erroneous
assignments before approval.

The credential's immutable `organization_document_store_id`, existing address
and network columns, and public issuer snapshot retain its issuance-time target.
Organization/issuer signing metadata and encrypted key storage are unchanged.

- `OrganizationDocumentStoreService`: scoped listing, automatic resolution,
  add, test, activate and safe administration RPC.
- `lib/document-store`: existing OpenAttestation-compatible `issue`, `isIssued`,
  `isRevoked`, `revoke`; new chain/code/role probe. Connection tests are read-only,
  bounded, and do not call `isRevoked` on an unissued hash (v4 reverts there).
- `RevocationService`: uses only the credential's retained contract/network,
  including the separately stored hash for TrustVC dual-method credentials.
- `CredentialService`: persists and exposes the public store association.
- `/document-stores`: add, approval/status, test, activation and deactivation UI.
- `/api/organization-document-stores`: tenant-scoped GET and same-origin POST
  actions `add`, `approve`, `test`, `activate`, `deactivate`.

## Security and operations

| Role | Scope |
|---|---|
| Platform administrator | View/manage all organizations' stores; approve assignments |
| Organization administrator | Add, test, activate/deactivate own approved stores |
| Issuer / viewer | Own-organization read-only registry |

RLS restricts reads. Direct writes are revoked even from `service_role`; the
service-only security-definer RPC rechecks actor membership and platform approval,
locks the organization, atomically switches stores, and records an audit event.
Activation requires an active organization and a successful test within ten
minutes; activation performs a fresh test first. Connection success is **not
ownership proof**. Platform administrators must independently confirm the
organization's authority over the contract before approving.

The application probes only configured RPC endpoints, never tenant-provided URLs.
It checks Sepolia chain ID, deployed code, `isIssued`, and both wallet roles on
AccessControl-compatible contracts. Older owner-only contracts are not accepted
by the new registry probe. RPC errors are returned as fixed safe messages.
Public metadata contains no private keys, encryption keys or secret RPC URLs.
Mutation requests have a 2 KiB body limit; connection/activation tests are
rate-limited per organization. Same-origin/session authorization is required.

The existing funded transaction wallet requires operational nonce coordination
when many issuers submit concurrently. This change does not add a durable
transaction queue or automated retries. Monitor registration audit events and
reconcile failed/uncertain transactions before retrying.

## Compatibility and migration

1. Rehearse migrations 015-021 in staging, then apply 021 before deploying runtime
   code. Runtime lookup errors fail explicitly if the migration is absent.
2. Keep the existing Verifiable.sg contract and transaction wallet configuration.
   No global store is claimed, changed, deactivated or automatically migrated.
3. Configure the existing server transaction key/RPC and fund its Sepolia account.
   An organization contract owner grants that wallet both required roles.
4. Add the contract, independently approve assignment as a platform admin, run
   Test Connection and Set Active Store.
5. Issue from two organizations; confirm distinct contract targets and receipts.
   Verify and revoke an old credential after switching active stores.
6. To return to fallback for new issuance, deactivate the organization store.
   Retain old contracts and wallet revocation authority indefinitely.

No historical credential JSON, signatures, hashes, store addresses or DID methods
are rewritten. Existing credentials have a null registry association and continue
using their saved profile/global contract. Verification already resolves saved
addresses/network/hash, not the current active store.

The ABI/protocol is reused from
[OpenAttestation Document Store](https://github.com/Open-Attestation/document-store);
that upstream repository is archived, not a newly maintained dependency.
TrustVC/W3C proof formats and OpenCerts payload modes are unchanged. Existing
limitations described in [issuer signer compatibility](./ISSUER_SIGNER_MODEL.md)
still apply. Local ABI/crypto tests are not external TradeTrust/OpenCerts viewer
certification.

## Validation

Local tests cover executable PostgreSQL migration/RLS/RPC permissions, approvals,
atomic switching, immutable snapshots, unchanged historical signed bytes,
pagination, API authorization/origin/limits, connection chain/code/role checks,
isolated register/read/revoke state, synchronous server registration and explicit
failure, single/batch no-double-wallet behavior, portal permissions and historical
revocation. Actual TrustVC/OpenCerts-mode signatures are checked against
deterministic ethers ABI responses for each saved address, including missing and
revoked hashes.

Production build/type-check and full-suite comparison are required release
checks. Live Sepolia transactions, Supabase deployment, RPC/funding/role setup and
external TradeTrust/OpenCerts viewer validation remain staging acceptance gates;
local tests spend no gas and make no ownership claim.

Implementation validation:

- Focused schema/service/API/portal/issuance/revocation suite: **87 passed**.
- Actual TrustVC/OpenCerts-mode organization-store crypto test: **passed**.
- `npm run build`: **passed**, including TypeScript validation.
- Full suite: **459 tests, 444 passed, 15 failed**. All 15 failing test names
  exactly match the preceding 444-test baseline; no new failing names.
- Production browser JavaScript scan: no issuer encryption key, transaction
  private-key configuration, encrypted key column or server store service matches.

No remote migration, deployment or live blockchain transaction was performed.
