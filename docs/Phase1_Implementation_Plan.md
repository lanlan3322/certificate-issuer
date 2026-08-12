# Phase 1 Implementation Plan

This plan addresses the Phase 1 roadmap items for the TrustVC foundation and focuses specifically on securing issuance, moving signing server-side, and refactoring the signing flow into a production-ready service model.

## Scope

Phase 1 roadmap items covered:

1. Remove client-side DID private keys
2. Design server-side signing architecture
3. Create Azure Function signing service
4. Create Key Vault integration design
5. Refactor TrustVC signing flow

---

## Task 1: Remove client-side DID private keys

### Files affected

- app/page.tsx
- lib/trustvc.ts
- lib/validation.ts
- README.md
- .env.example
- next.config.js
- package.json
- public/.well-known/did.json

### Code changes required

- Remove all browser access to private DID material.
- Delete or disable code paths that read NEXT_PUBLIC_DID_PRIVATE_KEY_MULTIBASE from the client bundle.
- Update the issuance flow so the browser calls a backend endpoint instead of signing locally.
- Replace client validation logic that assumes private key material exists in the browser runtime.
- Ensure public DID metadata remains client-visible only for verification, not private signing material.
- Update deployment documentation to clearly distinguish public DID metadata from private key custody.

### New files needed

- api/issue/route.ts or equivalent server endpoint
- api/verify/route.ts or equivalent server endpoint
- services/issuer/SigningRequestValidator.ts
- services/issuer/CertificateIssueRequest.ts

### Risks

- Breaking the existing UI flow if the browser still expects signed output immediately.
- The app may temporarily show unsigned or placeholder credentials during the migration window.
- Front-end hardening may be delayed if the team keeps mixed client and server execution paths active.

### Definition of done

- No private DID key material is present in browser bundle output.
- Browser code never reads or calls signing functions that require the secret key.
- All DID signing occurs through a backend endpoint.
- Deployment docs explicitly prohibit client-side private key usage.
- A smoke test confirms browser issuance fails gracefully if the API is unavailable.

---

## Task 2: Design server-side signing architecture

### Files affected

- app/page.tsx
- lib/trustvc.ts
- lib/constants.ts
- README.md
- docs/Architecture_Assessment.md

### Code changes required

- Introduce a server-side layer with clear boundaries:
  - Issuance API
  - Verification API
  - Signing service
  - DID service
  - Key retrieval service
- Move all TrustVC signing logic behind a service contract so the UI is decoupled from the crypto implementation.
- Define request and response DTOs for:
  - issue request
  - verify request
  - revocation request
  - signed credential response
- Define the trust model for:
  - incoming issuer identity
  - DID resolution
  - proof generation
  - chain/network proofs
- Ensure server-side architecture supports future multi-issuer tenancy and environment isolation.

### New files needed

- services/trustvc/TrustVCService.ts
- services/trustvc/DidService.ts
- services/trustvc/VerificationService.ts
- services/trustvc/IssuanceService.ts
- api/contracts/IssueCredentialRequest.ts
- api/contracts/VerificationRequest.ts
- api/contracts/SigningResult.ts

### Risks

- The system may still be too tightly coupled to front-end behavior if the API contract is not designed early.
- Cross-environment credential validation may fail if DID metadata, chain config, and issuer metadata are not normalized.
- If the API is not separated from the UI, future multi-issuer support will be difficult.

### Definition of done

- There is a documented backend signing flow from browser request to signed VC response.
- Signing is isolated behind server-owned services.
- Verification and signing use the same credential model and validation rules.
- Secret material lives only in the trusted backend environment.
- The architecture supports at least one issuer identity and is extensible to multiple issuers.

---

## Task 3: Create Azure Function signing service

### Files affected

- package.json
- README.md
- lib/trustvc.ts
- app/page.tsx
- .github/workflows/* (if deployment is integrated)

### Code changes required

- Add an Azure Function app with an issuance endpoint that accepts a credential payload and returns a signed VC.
- Implement a signing handler that:
  - validates the request schema
  - resolves the correct key and issuer configuration
  - calls TrustVC signing with a private key from Azure Key Vault
  - returns a signed VC JSON document
- Add a verify endpoint to validate signed credentials.
- Add health checks and startup validation for environment configuration.
- Ensure functions are stateless and can scale horizontally.
- Validate the Azure Function environment has the correct runtime dependencies for TrustVC signing without exposing Node-only browser shims.

### New files needed

- functions/IssueCredential/function.json
- functions/IssueCredential/index.ts
- functions/VerifyCredential/function.json
- functions/VerifyCredential/index.ts
- services/keyvault/KeyVaultSecretProvider.ts
- services/trustvc/TrustVCSigner.ts
- utils/credential/credentialSchema.ts
- config/issuer.config.ts

### Risks

- Azure Function cold starts may increase latency for first issuance requests.
- TrustVC signing dependencies may pull in Node-only modules that must be managed carefully in Azure runtime.
- A bad function configuration can accidentally expose operational information or route unauthorized requests.
- Key retrieval and signing must be resilient to transient Key Vault failures.

### Definition of done

- Azure Function receives issue requests and signs credentials using a backend-managed key.
- Signed payloads include valid proof blocks and issuer metadata.
- Function logs and telemetry are available without leaking secret material.
- The function is deployable and tested in a non-production Azure environment.
- UI requests can issue credentials without client-side secret access.

---

## Task 4: Create Key Vault integration design

### Files affected

- README.md
- lib/validation.ts
- lib/constants.ts
- .env.example
- package.json
- docs/Architecture_Assessment.md

### Code changes required

- Introduce a Key Vault abstraction that is only used in server-side code.
- Design the secret retrieval flow:
  - Azure Function loads managed identity or service principal configuration
  - Key Vault client resolves the DID signing key or secret bundle
  - The function fetches the necessary key material and uses it for signing
  - Key material is retained only in memory for the duration of the request
- Design support for key rotation:
  - versioned secret names
  - config-driven active key alias
  - fallback and rotation timeline
- Add a configuration contract for issuer-specific DID metadata and associated Key Vault secret references.
- Ensure no secret appears in logs, traces, or API responses.

### New files needed

- services/keyvault/KeyVaultClientFactory.ts
- services/keyvault/KeyVaultConfig.ts
- services/keyvault/KeyVaultSecretResolver.ts
- services/issuer/IssuerKeyResolver.ts
- config/issuer/issuer-registry.ts

### Risks

- Secret retrieval failures may block issuance if the application is not hardened for transient Key Vault errors.
- Managed identity misconfiguration may cause environment rollout issues.
- Rotation without a clean versioning strategy can break signing for in-flight operations.
- Secret names, versions, and DID metadata can drift if configuration is not centralized.

### Definition of done

- Key Vault is the sole source of private signing material for DID issuance.
- The system supports versioned key retrieval and rotation policy.
- No private key is stored in the repository, frontend build, or browser runtime.
- A runbook exists for Azure managed identity, access policies, and recovery steps.
- A failure mode is documented for Key Vault outage or secret absence.

---

## Task 5: Refactor TrustVC signing flow

### Files affected

- lib/trustvc.ts
- lib/constants.ts
- app/page.tsx
- app/verify/page.tsx
- lib/validation.ts
- README.md

### Code changes required

- Split the current monolithic signing logic into service-based responsibilities.
- Replace current browser-centric functions such as getDIDKeyPairFromEnv and issueDIDCertificate with server-owned service calls.
- Introduce a clean signing pipeline:
  - validate incoming certificate payload
  - resolve issuer identity and DID metadata
  - request key material from Key Vault
  - sign credential with TrustVC
  - return signed VC and metadata
- Keep verification logic separate from the signing pipeline.
- Remove direct TrustVC crypto code from UI components and route the call through API contracts.
- Standardize payload schema and proof handling to reduce duplicate logic and mixed credential shapes.

### New files needed

- services/trustvc/SigningWorkflow.ts
- services/trustvc/CredentialFactory.ts
- services/trustvc/ProofValidator.ts
- services/trustvc/TrustVCErrorMapper.ts
- api/contracts/IssueCredentialResponse.ts

### Risks

- The codebase may have hidden dependencies on client-side signing assumptions.
- Verification may fail if the signed output format is not identical across environments.
- A partial refactor can leave legacy signing code active and reintroduce key leakage.
- Teams may treat the UI as the source of truth instead of the API contract if standards are not enforced.

### Definition of done

- TrustVC signing logic has been moved behind server-side service contracts.
- No UI component invokes raw signing code using local private keys.
- A single canonical VC creation and signing path exists for all DID issuance flows.
- Verification of issued credentials is consistent with the signing output.
- The codebase can support both local dev and Azure-hosted backend execution without client secret leakage.

---

## Cross-task implementation order

1. Remove client-side secret exposure and disable browser signing paths.
2. Introduce the server-side API contract and signing workflow abstraction.
3. Implement the Azure Function signing service.
4. Integrate Azure Key Vault with managed identity and key versioning.
5. Refactor the remaining TrustVC logic into service modules and remove legacy assumptions.

This sequence minimizes blast radius and ensures the security foundation is established before broader platform features are built.

---

## Recommended implementation milestone split

### Milestone 1: Secure the signing boundary

- Remove all client-side private keys
- Disable browser signing by default
- Add backend issue API skeleton

### Milestone 2: Production-ready signing runtime

- Azure Function deployment
- Key Vault integration
- Signing validation and proof verification

### Milestone 3: Refactor and harden

- Service decomposition
- Standards alignment
- Test coverage and operational guardrails

---

## Summary

The Phase 1 work is primarily about establishing secure issuance trust and moving credential signing away from the browser. The repository already has the necessary TrustVC functionality, but it is embedded in a static front-end and relies on public environment variables for secret material. The recommended path is to treat signing as a backend capability, externalize key custody into Azure Key Vault, and refactor the credential flow into explicit service layers before expanding to multi-issuer capabilities.
