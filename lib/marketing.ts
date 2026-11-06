export interface MarketingEntry {
  slug: string;
  title: string;
  description: string;
  challenge: string;
  benefits: readonly string[];
  useCases: readonly string[];
  outcome: string;
}

export const solutions: readonly MarketingEntry[] = [
  {
    slug: "training-providers", title: "Training Providers",
    description: "Turn course completion into digital credentials that learners can share and employers can check.",
    challenge: "Manual certificates create repeated administration and leave employers dependent on email confirmation.",
    benefits: ["Issue a cohort from reusable branded templates.", "Give each authorized issuer its own signing identity.", "Manage corrections through revocation and replacement."],
    useCases: ["Course completion", "Continuing professional development", "Skills programme recognition"],
    outcome: "Give your team a repeatable issuance workflow and recipients a direct verification path.",
  },
  {
    slug: "professional-associations", title: "Professional Associations",
    description: "Manage membership credentials and professional certifications under your association's identity.",
    challenge: "Membership status changes, but a static certificate cannot show whether a credential remains valid.",
    benefits: ["Manage credential status after issuance.", "Separate certification and membership issuers.", "Keep an auditable record of credential operations."],
    useCases: ["Membership credentials", "Professional certifications", "Accreditation programmes"],
    outcome: "Help relying parties check current evidence without relying on the appearance of a document.",
  },
  {
    slug: "universities", title: "Universities",
    description: "Coordinate academic digital credentials across authorized faculties and programme teams.",
    challenge: "Decentralized issuance can fragment institutional identity and make verification difficult.",
    benefits: ["Organize multiple issuers within one institution.", "Use organization-managed or customer-hosted DID identity.", "Retain historical public verification methods when keys rotate."],
    useCases: ["Academic achievements", "Micro-credentials", "Professional education"],
    outcome: "Maintain institutional governance while letting authorized teams issue under their own issuer identity.",
  },
  {
    slug: "corporate-learning", title: "Corporate Learning",
    description: "Make learning achievements portable and verifiable across your organization.",
    challenge: "Training records are often scattered across teams and difficult to substantiate outside the original system.",
    benefits: ["Standardize reusable credential designs.", "Assign issuance permissions to the right teams.", "Issue individual credentials or batches."],
    useCases: ["Employee development", "Internal training", "Partner enablement"],
    outcome: "Create a consistent credential lifecycle without turning your learning team into a verification help desk.",
  },
  {
    slug: "certification-bodies", title: "Certification Bodies",
    description: "Support certification programmes with issuer governance, lifecycle controls and public verification.",
    challenge: "A copied document can look authentic even when the underlying certification has been revoked.",
    benefits: ["Sign credentials using issuer-specific keys.", "Review issuance and revocation activity.", "Optionally register hashes in an approved organization Document Store."],
    useCases: ["Professional qualifications", "Programme certification", "Competency recognition"],
    outcome: "Give verifiers cryptographic and status evidence, not just a branded PDF.",
  },
];

export const capabilities: readonly MarketingEntry[] = [
  {
    slug: "organization-management", title: "Organization Management",
    description: "Establish a governed credential workspace under your organization's identity and brand.",
    challenge: "Credential programmes need clear ownership, tenant boundaries and controlled access.",
    benefits: ["Manage organization memberships and roles.", "Keep issuer and template ownership explicit.", "Review subscription capacity and usage."],
    useCases: ["Organization onboarding", "Team governance", "Programme administration"],
    outcome: "One organization boundary connects your people, issuers, credentials and trust infrastructure.",
  },
  {
    slug: "issuer-management", title: "Issuer Management",
    description: "Delegate issuance to authorized teams without sharing a single platform signing identity.",
    challenge: "Shared signing keys obscure who issued a credential and complicate operational governance.",
    benefits: ["Associate each issuer with its own key pair.", "Select the issuer automatically through its template.", "Retain key versions and fingerprints for historical verification."],
    useCases: ["Multi-department programmes", "Issuer onboarding", "Key rotation"],
    outcome: "Make issuer accountability part of the credential, not an informal administrative convention.",
  },
  {
    slug: "credential-management", title: "Credential Management",
    description: "Issue, manage, share and revoke trusted digital credentials throughout their lifecycle.",
    challenge: "Generating a document is only the first step; status, delivery and traceability matter after issuance.",
    benefits: ["Issue individually or in batches from branded templates.", "Download signed credential files and human-readable PDFs.", "Review records and revoke through authorized workflows."],
    useCases: ["Professional certifications", "Membership credentials", "Training records"],
    outcome: "Manage the lifecycle in one workspace rather than treating certificates as disposable files.",
  },
  {
    slug: "digital-identity", title: "Digital Identity",
    description: "Publish verification methods under a managed or self-managed organization DID.",
    challenge: "Your credentials should point to your organization's identity, not only the platform that hosts them.",
    benefits: ["Choose managed DID hosting or did:web on your domain.", "Generate public deployment files and validate accessibility.", "Connect active issuers and retain historical verification methods."],
    useCases: ["Enterprise domain identity", "Public DID documents", "Issuer verification methods"],
    outcome: "Keep organization identity visible and verifiable across the credential lifecycle.",
  },
  {
    slug: "verification", title: "Verification Infrastructure",
    description: "Give recipients and relying parties a public place to check credential evidence.",
    challenge: "Visual inspection cannot establish whether a file was altered or its credential revoked.",
    benefits: ["Check supported cryptographic signatures and credential status.", "Show recorded issuer and organization attribution.", "Preserve legacy OpenCerts, TrustVC and TradeTrust workflows."],
    useCases: ["Recipient sharing", "Employer checks", "Credential status review"],
    outcome: "Make evidence accessible without requiring verifiers to sign in. Results depend on format and available trust evidence.",
  },
  {
    slug: "security", title: "Security & Governance",
    description: "Control credential operations with scoped access, issuer-owned signing and recorded activity.",
    challenge: "Trusted issuance requires more than a signature: access boundaries and key handling must be deliberate.",
    benefits: ["Apply role-based and issuer-membership authorization.", "Keep encrypted private signing keys server-side.", "Review audit activity and organization-owned anchoring configuration."],
    useCases: ["Access reviews", "Issuer key governance", "Lifecycle audit"],
    outcome: "Build operational trust without exposing private keys in DID documents. No compliance certification is implied.",
  },
];

export const resourcePages = [
  { slug: "faqs", title: "Frequently Asked Questions", description: "Understand organization identity, verification and onboarding.", items: [
    ["What is Credential-as-a-Service?", "Infrastructure to issue, manage, revoke and verify digital credentials under your organization's identity and brand."],
    ["Can we use our own domain?", "Self-managed did:web supports a customer-hosted root DID document. Deployment must be validated before that identity is used for issuance."],
    ["Is verification public?", "Yes. The public verifier does not require workspace access. Supported evidence depends on the credential format."],
    ["How do we get started?", "Book a demo or request a consultation. Workspace access follows the existing organization onboarding and invitation process."],
  ] },
  { slug: "documentation", title: "Documentation", description: "Practical guides for credential workflows and organization administration.", items: [
    ["User guide", "Issuance, sharing and verification workflows."], ["Admin guide", "Organization access, issuers, keys, DIDs and Document Stores."],
  ] },
  { slug: "case-studies", title: "Case Studies", description: "Customer stories will be published when approved.", items: [
    ["Planned resource", "No customer case studies are published here yet. Contact us to discuss your programme; no customer outcomes or endorsements are implied."],
  ] },
  { slug: "blog", title: "Blog", description: "Future perspectives on digital credentials and trust infrastructure.", items: [
    ["Planned resource", "Editorial articles are not published yet. Current product changes are available in the release notes."],
  ] },
  { slug: "whitepapers", title: "Whitepapers", description: "Future guides to credential infrastructure and issuer governance.", items: [
    ["Planned resource", "Whitepapers are not available yet. Use our documentation for current operational guidance."],
  ] },
] as const;

export function publicMetadata(path: string, title: string, description: string) {
  const url = `https://verifiable.sg${path === "/" ? "/" : `${path}/`}`;
  return {
    title: `${title} | Verifiable.sg`, description, alternates: { canonical: url },
    openGraph: { title: `${title} | Verifiable.sg`, description, url, type: "website" as const },
  };
}
