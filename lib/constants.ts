// TrustVC Configuration - TradeTrust/OpenAttestation compliant
// https://docs.tradetrust.io/

// Network configurations
export const NETWORKS = {
  sepolia: {
    name: "sepolia",
    chainId: 11155111,
    rpcUrl: "https://rpc.sepolia.org",
    blockExplorer: "https://sepolia.etherscan.io",
    currency: "ETH",
  },
  mainnet: {
    name: "mainnet",
    chainId: 1,
    rpcUrl: "https://ethereum.publicnode.com",
    blockExplorer: "https://etherscan.io",
    currency: "ETH",
  },
} as const;

// Current network - Sepolia for demo
export const CURRENT_NETWORK = NETWORKS.sepolia;

// Document Store Configuration
// TODO: Replace with your own deployed document store
// Deploy guide: https://docs.tradetrust.io/docs/how-tos/deployment
export const DOCUMENT_STORE_CONFIG = {
  // Demo document store on Sepolia
  // For production, deploy your own at:
  // https://sepolia.etherscan.io/address/0x4B30674f8F77C0b1aB4c8A34B2a85C295A3aE2D4
  address: "0x4B30674f8F77C0b1aB4c8A34B2a85C295A3aE2D4",
  
  // Identity Proof - DNS-TXT record
  // Add this TXT record to your DNS:
  // Name: _document-store.yourdomain.com
  // Value: openatts net=ethereum netId=11155111 addr=0xYourDocumentStoreAddress
  identityProof: {
    type: "DNS-TXT" as const,
    location: "lanlan3322.github.io",
  },
};

// Issuer Configuration
export const ISSUER_CONFIG = {
  name: "Certificate Issuer",
  url: "https://lanlan3322.github.io/certificate-issuer",
  documentStore: DOCUMENT_STORE_CONFIG.address,
  identityProof: DOCUMENT_STORE_CONFIG.identityProof,
};

// Certificate templates with OpenAttestation compatibility
export const CERTIFICATE_TEMPLATES = {
  ProfessionalCertificate: {
    name: "Professional Certificate",
    description: "Awarded for completing professional development courses",
    validForYears: 2,
    // OpenAttestation $template field
    oaTemplate: {
      name: "PROFESSIONAL_CERTIFICATE",
      type: "EMBEDDED_RENDERER",
      url: "https://templates.openattestation.com",
    },
  },
  CompletionCertificate: {
    name: "Certificate of Completion",
    description: "Awarded for attending workshops and seminars",
    validForYears: 1,
    oaTemplate: {
      name: "COMPLETION_CERTIFICATE",
      type: "EMBEDDED_RENDERER",
      url: "https://templates.openattestation.com",
    },
  },
  AchievementCertificate: {
    name: "Certificate of Achievement",
    description: "Recognizes outstanding performance and achievements",
    validForYears: 3,
    oaTemplate: {
      name: "ACHIEVEMENT_CERTIFICATE",
      type: "EMBEDDED_RENDERER",
      url: "https://templates.openattestation.com",
    },
  },
} as const;

// Demo certificates for gallery
export const DEMO_CERTIFICATES = [
  {
    id: "demo-cert-001",
    recipientName: "Ahmad bin Rahman",
    recipientEmail: "ahmad.rahman@techcorp.sg",
    certificateType: "Professional Certificate",
    issuerName: ISSUER_CONFIG.name,
    issueDate: "2026-03-15",
    description: "Certified in Artificial Intelligence Governance",
    validFrom: "2026-03-15",
    validUntil: "2028-03-14",
    status: "valid" as const,
  },
  {
    id: "demo-cert-002",
    recipientName: "Siti Nurhaliza",
    recipientEmail: "siti.nurhaliza@datawise.io",
    certificateType: "Certificate of Completion",
    issuerName: ISSUER_CONFIG.name,
    issueDate: "2026-02-28",
    description: "Completed Data Ethics in AI Workshop",
    validFrom: "2026-02-28",
    validUntil: "2027-02-27",
    status: "valid" as const,
  },
  {
    id: "demo-cert-003",
    recipientName: "David Chen Wei",
    recipientEmail: "david.chen@innovatech.sg",
    certificateType: "Certificate of Achievement",
    issuerName: ISSUER_CONFIG.name,
    issueDate: "2026-01-20",
    description: "Excellence in Cloud Architecture Implementation",
    validFrom: "2026-01-20",
    validUntil: "2029-01-19",
    status: "valid" as const,
  },
];

// TrustVC SDK Configuration
// Used by trustvc.ts for building Verifiable Credentials
export const TRUSTVC_CONFIG = {
  didUrl: `did:web:${new URL(ISSUER_CONFIG.url).hostname}`,
  demoIssuer: {
    name: ISSUER_CONFIG.name,
    documentStore: ISSUER_CONFIG.documentStore,
    identityProof: ISSUER_CONFIG.identityProof,
  },
};

// Deployment steps for TradeTrust compliance
export const DEPLOYMENT_STEPS = [
  {
    step: 1,
    title: "Deploy Document Store",
    description: "Deploy a document store smart contract on Sepolia testnet",
    action: "Deploy",
    link: "https://sepolia.etherscan.io/address/0x4B30674f8F77C0b1aB4c8A34B2a85C295A3aE2D4",
  },
  {
    step: 2,
    title: "Configure DNS-TXT",
    description: "Add DNS TXT record to prove domain ownership",
    action: "Configure",
    link: "#dns-config",
  },
  {
    step: 3,
    title: "Issue Certificates",
    description: "Connect wallet and issue verifiable certificates",
    action: "Issue",
    link: "#",
  },
];
