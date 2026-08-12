# GitHub Issues Backlog

This backlog translates the roadmap into actionable GitHub issues for engineering delivery. Each issue includes a clear business value statement, defined acceptance criteria, dependency mapping, and an implementation complexity estimate.

---

## Phase 1: Stabilization & Security Foundation

### Issue 1: TrustVC Signing Validation
- Title: TrustVC Signing Validation
- Description: Create a standalone TrustVC signing validation project to verify the full credential lifecycle outside the Next.js application, standardize the W3C VC payload format, and eliminate mixed OpenAttestation and W3C payload patterns.
- Business value: Reduces signing risk, ensures the credential model is stable, and gives the team confidence before releasing TrustVC issuance to production users.
- Acceptance criteria:
  - [ ] A standalone validation project exists for TrustVC signing experiments.
  - [ ] Signed W3C VC output is generated successfully.
  - [ ] Proof block generation is verified and reproducible.
  - [ ] Verification succeeds against the signed document.
  - [ ] The payload format is standardized and consistent across issuance flows.
  - [ ] Mixed payload patterns are removed from issuance logic.
- Dependencies:
  - TrustVC SDK integration research and environment setup
  - Test key material or secure demo DID configuration
- Complexity estimate: Medium

### Issue 2: Move Signing Server-Side
- Title: Move TrustVC Signing Server-Side
- Description: Implement server-side issuance and verification APIs and remove browser-side signing from the application. Introduce API endpoints for credential issuance and verification.
- Business value: Protects signing keys, aligns with production security practice, and creates a clean API boundary for issuer operations.
- Acceptance criteria:
  - [ ] POST /api/issue is implemented and secured.
  - [ ] POST /api/verify is implemented and secured.
  - [ ] Browser-side signing is removed or disabled in the web app.
  - [ ] Signing is performed in a trusted backend environment.
  - [ ] Verification and issuance pass end-to-end contract tests.
- Dependencies:
  - Issue 1: TrustVC Signing Validation
  - Backend application skeleton or service layer
- Complexity estimate: Large

### Issue 3: Key Vault Integration
- Title: Azure Key Vault Integration
- Description: Integrate Azure Key Vault for secure key provisioning, retrieval, signing proxying, and rotation support. Establish a secure signing service that does not expose private material to client code.
- Business value: Enables enterprise-grade key custody, compliance readiness, and safer operational procedures for production certificate issuance.
- Acceptance criteria:
  - [ ] Signing keys are retrieved from Azure Key Vault rather than local or browser storage.
  - [ ] A signing proxy or secure key retrieval service is in place.
  - [ ] Key rotation is supported through a documented operational flow.
  - [ ] Access control and auditability are configured for signing operations.
  - [ ] The web app no longer depends on client-visible signing secrets.
- Dependencies:
  - Issue 2: Move Signing Server-Side
  - Azure environment and access configuration
- Complexity estimate: Large

### Issue 4: Refactor TrustVC Layer
- Title: Refactor TrustVC Layer into Service Boundaries
- Description: Split the current monolithic trustvc.ts into logical services: TrustVCService, DidService, VerificationService, and IssuanceService. Refactor constants.ts to support a cleaner configuration model.
- Business value: Improves maintainability, reduces regression risk, and supports platform growth into multiple issuers and credential types.
- Acceptance criteria:
  - [ ] trustvc.ts is refactored into explicit service modules.
  - [ ] constants.ts is simplified and clearly separated by domain responsibility.
  - [ ] DidService handles DID configuration and resolution concerns.
  - [ ] VerificationService owns proof and credential verification logic.
  - [ ] IssuanceService owns issuance orchestration and status handling.
  - [ ] Unit tests cover each service behavior.
- Dependencies:
  - Issue 1: TrustVC Signing Validation
  - Issue 2: Move Signing Server-Side
- Complexity estimate: Large

---

## Phase 2: Multi-Issuer Platform

### Issue 5: Organization Management Model
- Title: Organization Management Model
- Description: Create the core entities and data model for multi-issuer platform operations, including Organization, Issuer, User, and Role.
- Business value: Enables multi-tenant operations, clearer ownership boundaries, and the foundation for RBAC and platform governance.
- Acceptance criteria:
  - [ ] Organization entity exists with required attributes.
  - [ ] Issuer entity is modeled with organization ownership.
  - [ ] User entity supports identity and platform membership.
  - [ ] Role model supports assignment and lookup logic.
  - [ ] Persistence schema or equivalent repository layer is defined.
- Dependencies:
  - Phase 1 service and security foundation
  - App data persistence strategy
- Complexity estimate: Medium

### Issue 6: Issuer Workspace Management
- Title: Issuer Workspace Management
- Description: Enable creation, editing, and disabling of issuer workspaces so each issuer can manage its own configuration and credential workflows.
- Business value: Creates the operational foundation for platform-level issuer onboarding and lifecycle management.
- Acceptance criteria:
  - [ ] Issuer can be created through a management flow.
  - [ ] Issuer settings can be updated.
  - [ ] Issuer can be disabled or suspended.
  - [ ] Disabled issuers cannot issue credentials.
  - [ ] Workspace-level metadata is stored and visible in the admin interface.
- Dependencies:
  - Issue 5: Organization Management Model
- Complexity estimate: Medium

### Issue 7: DID Lifecycle Management
- Title: DID Lifecycle Management
- Description: Provide workflows for generating, importing, exporting, rotating, and deactivating DID identities used for signing and verification.
- Business value: Reduces operational risk around key lifecycle, supports issuer continuity, and enables trust to be maintained across key rotation events.
- Acceptance criteria:
  - [ ] DID generation flow is implemented.
  - [ ] DID import flow is supported.
  - [ ] DID export flow is supported.
  - [ ] Key rotation workflow is defined and operationalized.
  - [ ] DID deactivation flow prevents further use for credential signing.
  - [ ] DID metadata is stored and auditable.
- Dependencies:
  - Issue 3: Key Vault Integration
  - Issue 4: Refactor TrustVC Layer
- Complexity estimate: Large

### Issue 8: Branding and Issuer Profile Configuration
- Title: Branding and Issuer Profile Configuration
- Description: Add issuer branding capabilities covering logo, theme color, website, description, and verification branding.
- Business value: Improves issuer trust, visual consistency, and the user experience for recipients and verifiers.
- Acceptance criteria:
  - [ ] Issuer has a configurable logo field.
  - [ ] Issuer can define a theme color.
  - [ ] Issuer website and description are stored.
  - [ ] Verification branding is displayed consistently in verification outputs.
  - [ ] Brand settings are applied to rendered credential templates.
- Dependencies:
  - Issue 6: Issuer Workspace Management
- Complexity estimate: Medium

### Issue 9: Role-Based Access Control
- Title: Platform RBAC for Issuer Roles
- Description: Define and enforce the roles Platform Admin, Issuer Admin, Issuer Operator, and Verifier across the platform.
- Business value: Prevents unauthorized credential issuance and clarifies operational responsibilities across the platform.
- Acceptance criteria:
  - [ ] Platform Admin role is defined and enforced.
  - [ ] Issuer Admin role is defined and enforced.
  - [ ] Issuer Operator role is defined and enforced.
  - [ ] Verifier role is defined and enforced.
  - [ ] Access is validated through backend authorization checks.
  - [ ] Unauthorized actions are blocked with clear errors.
- Dependencies:
  - Issue 5: Organization Management Model
  - Authentication strategy
- Complexity estimate: Large

---

## Phase 3: Certificate Issuing Platform

### Issue 10: Template Builder
- Title: Template Builder for Certificate Design
- Description: Create a visual certificate template builder that allows issuers to design and manage certificate layouts without directly editing source templates.
- Business value: Reduces dependence on engineering for certificate styling and makes issuance operationally flexible for business users.
- Acceptance criteria:
  - [ ] A visual designer for certificate layouts is implemented.
  - [ ] Users can set branding and content blocks in a no-code workflow.
  - [ ] Templates can be saved and reused across issuers.
  - [ ] Preview renders match final certificate output.
- Dependencies:
  - Issue 8: Branding and Issuer Profile Configuration
- Complexity estimate: Large

### Issue 11: Dynamic Template Rendering
- Title: Dynamic Template Rendering
- Description: Support dynamic credential fields including text fields, dates, course information, grades, and variable substitutions in template rendering.
- Business value: Makes issuance scalable for education, training, validation, and compliance certificate scenarios.
- Acceptance criteria:
  - [ ] Templates support text field interpolation.
  - [ ] Date values render correctly.
  - [ ] Course metadata can be displayed dynamically.
  - [ ] Grade fields render correctly.
  - [ ] Variable substitution works in issued credentials.
- Dependencies:
  - Issue 10: Template Builder
- Complexity estimate: Medium

### Issue 12: Bulk Credential Issuance
- Title: Bulk Credential Issuance
- Description: Support bulk issuance from Excel, CSV, and JSON inputs, generating signed credential payloads and ZIP packages ready for distribution.
- Business value: Enables scale operations for large credential batches and reduces manual issuance overhead.
- Acceptance criteria:
  - [ ] CSV input is supported.
  - [ ] Excel input is supported.
  - [ ] JSON input is supported.
  - [ ] Certificates are signed as part of the bulk flow.
  - [ ] ZIP output is generated for distribution.
  - [ ] Validation catches malformed rows before issuance.
- Dependencies:
  - Issue 2: Move Signing Server-Side
  - Issue 11: Dynamic Template Rendering
- Complexity estimate: Large

### Issue 13: Revocation Management
- Title: Credential Revocation Management
- Description: Implement revocation, suspension, and reinstatement flows with support for credential status lists and related APIs.
- Business value: Enables trusted lifecycle management for issued credentials and improves compliance for revoked or suspended records.
- Acceptance criteria:
  - [ ] POST /revoke API is implemented.
  - [ ] POST /suspend API is implemented.
  - [ ] POST /reinstate API is implemented.
  - [ ] Credential status list or equivalent revocation model is supported.
  - [ ] Status transitions are auditable.
- Dependencies:
  - Issue 2: Move Signing Server-Side
  - Issue 4: Refactor TrustVC Layer
- Complexity estimate: Large

### Issue 14: Verification Portal
- Title: Public Verification Portal
- Description: Build a verification portal that supports uploading JSON, pasting VC payloads, scanning QR codes, and showing cryptographic validation results.
- Business value: Improves trust and usability by allowing recipients, employers, and auditors to verify credentials quickly and clearly.
- Acceptance criteria:
  - [ ] JSON upload verification flow works.
  - [ ] Manual JSON paste verification works.
  - [ ] QR code verification flow is implemented.
  - [ ] Validation results clearly display cryptographic outcome.
  - [ ] The portal works for public verification use cases.
- Dependencies:
  - Issue 2: Move Signing Server-Side
  - Issue 4: Refactor TrustVC Layer
- Complexity estimate: Medium

---

## Phase 4: Commercial SaaS Platform

### Issue 15: Recipient Experience and Delivery
- Title: Recipient Experience and Delivery
- Description: Provide a better recipient experience through email delivery, verification URLs, QR codes, and PDF certificate representations.
- Business value: Makes issued credentials more usable and improves trust and adoption among end recipients.
- Acceptance criteria:
  - [ ] Email delivery flow is implemented.
  - [ ] Verification URL is generated for issued credentials.
  - [ ] QR code is rendered for quick verification.
  - [ ] PDF representation is generated for download or delivery.
  - [ ] Workflow supports both human and programmatic delivery.
- Dependencies:
  - Issue 12: Bulk Credential Issuance
  - Issue 14: Verification Portal
- Complexity estimate: Large

### Issue 16: Wallet Integration
- Title: Wallet Integration Expansion
- Description: Support OpenCerts Wallet, Microsoft Entra Verified ID, and future VC wallet ecosystems to increase portability and interoperability.
- Business value: Broadens the value of credentials and improves compatibility with user wallets and enterprise identity tools.
- Acceptance criteria:
  - [ ] OpenCerts wallet compatibility is supported.
  - [ ] Microsoft Entra Verified ID integration path is defined.
  - [ ] Future wallet interoperability approach is documented.
  - [ ] Credential payloads are compatible with wallet-consuming standards.
- Dependencies:
  - Issue 1: TrustVC Signing Validation
  - Issue 4: Refactor TrustVC Layer
- Complexity estimate: Large

### Issue 17: Audit & Compliance Tracking
- Title: Audit and Compliance Tracking
- Description: Track issued, downloaded, verified, revoked, and updated certificate events to support operational transparency and compliance requirements.
- Business value: Gives the platform a trustworthy operational record and supports internal and external compliance reporting.
- Acceptance criteria:
  - [ ] Issued event tracking is implemented.
  - [ ] Download tracking is implemented.
  - [ ] Verification tracking is implemented.
  - [ ] Revoked event tracking is implemented.
  - [ ] Updated credential transitions are tracked.
  - [ ] Audit logs are queryable and retained.
- Dependencies:
  - Issue 13: Revocation Management
  - Issue 14: Verification Portal
- Complexity estimate: Medium

### Issue 18: API Platform
- Title: API Platform for Credential Operations
- Description: Expose a scalable API surface for issue, verify, revoke, and credential lookup operations.
- Business value: Enables integrations, automation, and platform extensibility beyond the browser experience.
- Acceptance criteria:
  - [ ] POST /issue is available through the public or internal API layer.
  - [ ] POST /verify is available.
  - [ ] POST /revoke is available.
  - [ ] GET /credential/{id} returns credential metadata or payload.
  - [ ] Rate limiting and authentication controls are defined.
- Dependencies:
  - Issue 2: Move Signing Server-Side
  - Issue 13: Revocation Management
- Complexity estimate: Large

### Issue 19: Enterprise Authentication
- Title: Enterprise Authentication Integration
- Description: Add enterprise authentication support through Microsoft Entra ID, Google Workspace, and GitHub to support business and SaaS access control.
- Business value: Unlocks secure workforce access and enterprise adoption across organization-managed identity systems.
- Acceptance criteria:
  - [ ] Microsoft Entra ID login is supported.
  - [ ] Google Workspace login is supported.
  - [ ] GitHub login is supported.
  - [ ] User mapping to tenant roles is implemented.
  - [ ] SSO-enabled flows pass security review.
- Dependencies:
  - Issue 9: Role-Based Access Control
  - Authentication provider setup
- Complexity estimate: Large

### Issue 20: Subscription Management
- Title: Subscription and Billing Management
- Description: Introduce Starter, Professional, and Enterprise plans with billing and usage governance for the commercial SaaS platform.
- Business value: Enables monetization, tiered access, and sustainable commercial operations.
- Acceptance criteria:
  - [ ] Starter plan is defined and available.
  - [ ] Professional plan is defined and available.
  - [ ] Enterprise plan is defined and available.
  - [ ] Billing and subscription lifecycle are implemented.
  - [ ] Plan gates are enforced for platform usage.
- Dependencies:
  - Issue 19: Enterprise Authentication
  - Issue 18: API Platform
- Complexity estimate: Large

---

## Recommended Delivery Order

1. Phase 1 foundation issues
2. Phase 2 multi-issuer foundation
3. Phase 3 platform operations and issuance automation
4. Phase 4 SaaS and enterprise launch readiness

This order preserves the roadmap’s sequencing: establish secure signing and trust architecture first, then expand to multi-issuer operations, then issue platform capabilities, and finally move to commercial SaaS readiness.
