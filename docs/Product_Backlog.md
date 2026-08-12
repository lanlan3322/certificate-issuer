# Product Backlog

This backlog translates the TrustVC roadmap into an agile delivery plan suitable for a multi-phase product build. It groups work into epics, features, user stories, and technical tasks, and assigns effort estimates using Small, Medium, and Large.

---

## Epic 1: Secure TrustVC Foundation

### Feature 1.1: TrustVC Signing Validation
- User story: As a platform engineer, I want to validate TrustVC signing outside the web app so that we can verify the production signing model before release.
- Technical tasks:
  - Set up a standalone TrustVC signing validation environment
  - Validate signed W3C VC generation and proof output
  - Validate verification success against the signed document
  - Standardize the VC payload format
  - Remove mixed payload patterns
- Estimate: Medium

### Feature 1.2: Server-Side Signing
- User story: As a security owner, I want signing to happen on the server so that private keys are never exposed to the browser.
- Technical tasks:
  - Design secure server-side signing architecture
  - Implement issue API endpoint
  - Implement verify API endpoint
  - Remove browser-side signing from the UI
  - Add secure response contracts for signed credentials
- Estimate: Large

### Feature 1.3: Key Vault and Secret Management
- User story: As an engineering manager, I want private key material stored in Azure Key Vault so that signing keys are protected and auditable.
- Technical tasks:
  - Design Key Vault secret retrieval flow
  - Configure managed identity or service principal access
  - Add key rotation process and versioning
  - Refactor environment configuration to remove public-private key leakage
  - Add operational runbook for key recovery and rotation
- Estimate: Large

### Feature 1.4: TrustVC Service Refactor
- User story: As a maintainer, I want the TrustVC logic split into service boundaries so that the architecture is maintainable and production-ready.
- Technical tasks:
  - Split monolithic trustvc.ts into service modules
  - Create DidService
  - Create VerificationService
  - Create IssuanceService
  - Create TrustVCService abstraction
  - Refactor constants and config for services
- Estimate: Large

---

## Epic 2: Multi-Issuer Platform

### Feature 2.1: Organization and Issuer Model
- User story: As a platform admin, I want to manage organizations and issuers so that the platform can support multiple tenants and issuer identities.
- Technical tasks:
  - Define Organization entity
  - Define Issuer entity
  - Define User entity and Role entity
  - Add persistence models and repository layer
  - Add basic admin screens for tenant/issuer management
- Estimate: Medium

### Feature 2.2: Issuer Workspace Management
- User story: As an issuer admin, I want to create, edit, and disable issuers so that I can manage issuer lifecycle safely.
- Technical tasks:
  - Create issuer workflow
  - Edit issuer workflow
  - Disable issuer workflow
  - Add validation and status checks
- Estimate: Medium

### Feature 2.3: DID Lifecycle Management
- User story: As an issuer admin, I want to generate, import, rotate, export, and deactivate DIDs so that credential signing remains trusted and operationally manageable.
- Technical tasks:
  - Generate DID flow
  - Import DID flow
  - Export DID flow
  - Rotate keys
  - Deactivate DID
  - Add DID audit events
- Estimate: Large

### Feature 2.4: Issuer Branding and Metadata
- User story: As a brand owner, I want issuer branding, website, and verification metadata so that certificates feel trustworthy and recognizable.
- Technical tasks:
  - Add logo configuration
  - Add theme color configuration
  - Add issuer description
  - Add verification branding
  - Render branding into certificate output
- Estimate: Medium

### Feature 2.5: RBAC and Access Control
- User story: As a platform admin, I want role-based permissions so that only authorized users can issue, verify, or manage credentials.
- Technical tasks:
  - Define Platform Admin role
  - Define Issuer Admin role
  - Define Issuer Operator role
  - Define Verifier role
  - Add authorization checks to all APIs
  - Enforce tenant-level access policies
- Estimate: Large

---

## Epic 3: Certificate Issuing Platform

### Feature 3.1: Certificate Template Builder
- User story: As an issuer operator, I want a visual template builder so that I can create branded credential layouts without engineering changes.
- Technical tasks:
  - Design template editor UI
  - Support template serialization and storage
  - Add template preview mode
  - Support template versioning
- Estimate: Large

### Feature 3.2: Dynamic Template Rendering
- User story: As an issuer admin, I want dynamic fields like text, dates, course metadata, and grades to render automatically so that certificates are personalized and accurate.
- Technical tasks:
  - Add dynamic variable support
  - Add date processing
  - Add course details rendering
  - Add grade rendering
  - Add template validation
- Estimate: Medium

### Feature 3.3: Bulk Credential Issuance
- User story: As an issuer operator, I want to upload CSV, Excel, or JSON inputs so that I can issue large numbers of credentials efficiently.
- Technical tasks:
  - Add CSV import processor
  - Add Excel import processor
  - Add JSON import processor
  - Add validation engine for row/data checks
  - Generate signed credentials in batch
  - Produce ZIP archive outputs
- Estimate: Large

### Feature 3.4: Revocation Management
- User story: As an issuer admin, I want to revoke, suspend, and reinstate credentials so that credential status remains accurate and trustworthy.
- Technical tasks:
  - Implement revoke API
  - Implement suspend API
  - Implement reinstate API
  - Add credential status model
  - Add status list or revocation source integration
- Estimate: Large

### Feature 3.5: Verification Portal
- User story: As a verifier, I want to upload or paste a VC and review cryptographic validation results so that I can assess credential trust quickly.
- Technical tasks:
  - Build JSON upload flow
  - Build paste JSON flow
  - Add QR code verification UI
  - Implement cryptographic validation
  - Display issuer and status details
- Estimate: Medium

---

## Epic 4: Commercial SaaS Platform

### Feature 4.1: Recipient Experience and Delivery
- User story: As a certificate recipient, I want email delivery and verification links so that I can access and validate my credential easily.
- Technical tasks:
  - Add email delivery integration
  - Create verification URL generation
  - Add QR code generation
  - Generate PDF or printable certificate view
  - Add delivery status tracking
- Estimate: Large

### Feature 4.2: Wallet Integration
- User story: As a recipient or third-party wallet user, I want my credentials to be compatible with wallet ecosystems so that they are portable and verifiable in common wallet experiences.
- Technical tasks:
  - Assess OpenCerts wallet compatibility
  - Plan Microsoft Entra Verified ID integration
  - Define abstraction for future wallet standards
  - Validate credential portability
- Estimate: Large

### Feature 4.3: Audit and Compliance
- User story: As a compliance officer, I want issued, downloaded, verified, revoked, and updated events tracked so that the platform remains accountable and auditable.
- Technical tasks:
  - Capture issue events
  - Capture download events
  - Capture verification events
  - Capture revocation events
  - Capture updates and status changes
  - Expose audit log APIs and reporting
- Estimate: Medium

### Feature 4.4: API Platform
- User story: As an integrator, I want a documented API so that my systems can issue, verify, and retrieve credentials without using the UI.
- Technical tasks:
  - Design versioned API surface
  - Implement issue API
  - Implement verify API
  - Implement revoke API
  - Implement GET /credential/{id}
  - Add rate limiting and documentation
- Estimate: Large

### Feature 4.5: Enterprise Authentication
- User story: As an enterprise customer, I want SSO with Microsoft Entra ID, Google Workspace, and GitHub so that my users can access the platform with organization-approved identity.
- Technical tasks:
  - Configure Microsoft Entra ID integration
  - Configure Google Workspace integration
  - Configure GitHub integration
  - Map SSO users to roles and tenants
  - Enforce session and access policies
- Estimate: Large

### Feature 4.6: Subscription Management
- User story: As a product owner, I want tiered plans and billing so that the platform can operate as a commercial SaaS product.
- Technical tasks:
  - Define Starter plan
  - Define Professional plan
  - Define Enterprise plan
  - Add subscription billing flow
  - Enforce plan-based usage limits
- Estimate: Large

---

## User Stories Summary

### Platform Admin
- I want to configure issuers and organizations.
- I want to assign roles and permissions.
- I want to monitor issuance and verification trends.
- I want to review audit logs and security events.

### Issuer Admin
- I want to issue certificate credentials securely.
- I want to manage issuer branding and DID configuration.
- I want to revoke or suspend certificates when needed.
- I want to upload or process certificate batches.

### Issuer Operator
- I want to prepare templates and issue batches.
- I want to monitor job progress and results.
- I want to download generated artifacts and reports.

### Verifier
- I want to validate signed credentials and view trust details.
- I want to confirm whether the issuer or document is revoked.

### Recipient
- I want a certificate I can access and verify.
- I want a clear verification URL and printable representation.

---

## Technical Tasks by Priority

### High Priority
- Secure signing architecture and secret management
- Server-side issuance and verification API
- DID lifecycle management
- Multi-issuer role model
- Revocation and status model

### Medium Priority
- Template designer and dynamic rendering
- Verification portal polish
- Bulk issuance processing
- Audit logs and compliance event capture

### Lower Priority
- Recipient delivery channels
- Wallet integration expansion
- Enterprise SSO and subscription management

---

## Sprint Plan

## Sprint 1

### Goal
Secure the foundation for TrustVC issuance and remove critical security risks.

### Included work
- TrustVC signing validation
- Server-side signing implementation
- Azure Key Vault design and integration
- TrustVC service refactor

### Estimated capacity
- Focus on core secure architecture and foundational API work

### Deliverables
- Signed VC generation validated outside the app
- Browser no longer contains private key material
- Backend signing route implemented
- Key management design approved

---

## Sprint 2

### Goal
Support multi-issuer foundation and DID operations.

### Included work
- Organization and issuer model
- Issuer workspace management
- DID lifecycle management
- Branding and metadata configuration
- RBAC foundation

### Deliverables
- Multi-issuer platform base model ready
- Issuer admin flows working
- DID generation and rotation flow available
- Role enforcement in place for core actions

---

## Sprint 3

### Goal
Deliver operational certificate issuance capabilities.

### Included work
- Template builder
- Dynamic template rendering
- Bulk issuance
- Revocation management
- Verification portal

### Deliverables
- Bulk issuance pipeline operational
- Credential templates rendered dynamically
- Revocation and suspension flows working
- Public verification portal available

---

## Sprint 4

### Goal
Prepare the product for enterprise adoption and SaaS launch.

### Included work
- Recipient experience and delivery
- Wallet integration
- Audit and compliance tracking
- API platform
- Enterprise authentication
- Subscription management

### Deliverables
- Commercial SaaS-ready operations
- Enterprise SSO integrated
- Public and internal integrations supported
- Billing and plan enforcement available

---

## Effort Summary

| Estimate | Count |
|---|---:|
| Small | 0 |
| Medium | 11 |
| Large | 18 |

Note: The backlog is intentionally weighted toward Large items because the roadmap’s Phase 1 and platform growth steps are architectural and integration-heavy.

---

## Recommended Delivery Sequence

1. Phase 1: Secure TrustVC foundation
2. Phase 2: Multi-issuer enablement
3. Phase 3: Operational issuance platform
4. Phase 4: SaaS and enterprise scale

This order minimizes risk by ensuring the platform is secure and stable before introducing multi-tenant operations, bulk issuance, and commercial SaaS capabilities.
