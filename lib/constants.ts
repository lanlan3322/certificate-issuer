// TrustVC Configuration
// Using IMDA's OpenCerts infrastructure via TrustVC SDK

export const TRUSTVC_CONFIG = {
  // Network configuration
  network: "sepolia",
  chainId: 11155111,

  // Document Store (OpenCerts pattern on Sepolia)
  // This is a demo document store - replace with your own after deployment
  documentStoreAddress: "0x4B506057A2b1Ac5C3c5E4B4A4d2eD3b6f1a3C4e5",

  // DID Configuration - using did:web
  // Replace with your own DID after deployment
  didWebDomain: "certificate-issuer.vercel.app",
  didUrl: "did:web:certificate-issuer.vercel.app",

  // Demo issuer info
  demoIssuer: {
    name: "IMDA Training Academy",
    url: "https://www.imda.gov.sg",
    documentStore: "0x4B506057A2b1Ac5C3c5E4B4A4d2eD3b6f1a3C4e5",
    identityProof: {
      type: "DNS-TXT" as const,
      location: "certificate-issuer.vercel.app",
    },
  },

  // Cryptographic suite
  cryptoSuite: "ecdsa-sd-2023" as const,
};

// Certificate templates
export const CERTIFICATE_TEMPLATES = {
  ProfessionalCertificate: {
    name: "Professional Certificate",
    description: "Awarded for completing professional development courses",
    validForYears: 2,
  },
  CompletionCertificate: {
    name: "Certificate of Completion",
    description: "Awarded for attending workshops and seminars",
    validForYears: 1,
  },
  AchievementCertificate: {
    name: "Certificate of Achievement",
    description: "Recognizes outstanding performance and achievements",
    validForYears: 3,
  },
};

// Sample demo certificates for gallery
export const DEMO_CERTIFICATES = [
  {
    id: "demo-cert-001",
    recipientName: "Ahmad bin Rahman",
    recipientEmail: "ahmad.rahman@techcorp.sg",
    certificateType: "Professional Certificate",
    issuerName: "IMDA Training Academy",
    issueDate: "2026-03-15",
    description: "Certified in Artificial Intelligence Governance",
    validFrom: "2026-03-15",
    validUntil: "2028-03-14",
    status: "valid",
  },
  {
    id: "demo-cert-002",
    recipientName: "Siti Nurhaliza",
    recipientEmail: "siti.nurhaliza@datawise.io",
    certificateType: "Certificate of Completion",
    issuerName: "IMDA Training Academy",
    issueDate: "2026-02-28",
    description: "Completed Data Ethics in AI Workshop",
    validFrom: "2026-02-28",
    validUntil: "2027-02-27",
    status: "valid",
  },
  {
    id: "demo-cert-003",
    recipientName: "David Chen Wei",
    recipientEmail: "david.chen@innovatech.sg",
    certificateType: "Certificate of Achievement",
    issuerName: "IMDA Training Academy",
    issueDate: "2026-01-20",
    description: "Excellence in Cloud Architecture Implementation",
    validFrom: "2026-01-20",
    validUntil: "2029-01-19",
    status: "valid",
  },
];