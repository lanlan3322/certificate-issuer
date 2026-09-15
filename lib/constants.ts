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

export const SUPPORTED_ISSUING_METHODS = {
  ethereum: {
    label: "Ethereum",
  },
  did: {
    label: "DID",
  },
} as const;

export type IssuingMethod = keyof typeof SUPPORTED_ISSUING_METHODS;

export const DEFAULT_ISSUING_METHODS: IssuingMethod[] = ["did"];

export function formatIssuingMethodLabels(
  issuingMethods: IssuingMethod[] = DEFAULT_ISSUING_METHODS
): string {
  return issuingMethods
    .map((method) => SUPPORTED_ISSUING_METHODS[method].label)
    .join(", ");
}

// Document Store Configuration
// TODO: Replace with your own deployed document store
// Deploy guide: https://docs.tradetrust.io/docs/how-tos/deployment
export const DOCUMENT_STORE_CONFIG = {
  // Demo document store on Sepolia
  // For production, deploy your own at:
  // https://sepolia.etherscan.io/address/0x4B30674f8F77C0b1Ab4C8A34b2a85C295A3aE2D4
  address: "0x4B30674f8F77C0b1Ab4C8A34b2a85C295A3aE2D4",
  
  // Identity Proof - DNS-TXT record
  // Add this TXT record to your DNS:
  // Name: _document-store.yourdomain.com
  // Value: openatts net=ethereum netId=11155111 addr=0xYourDocumentStoreAddress
  identityProof: {
    type: "DNS-TXT" as const,
    location: "verifiable.sg",
  },
};

// Issuer Configuration
export const ISSUER_CONFIG = {
  name: "Certificate Issuer",
  url: "https://verifiable.sg",
  documentStore: DOCUMENT_STORE_CONFIG.address,
  identityProof: DOCUMENT_STORE_CONFIG.identityProof,
};

// Certificate templates with OpenCerts compatibility
export const CERTIFICATE_TEMPLATES = {
  ProfessionalCertificate: {
    name: "Professional Certificate",
    description: "Awarded for completing professional development courses",
    validForYears: 2,
    // Canonical OpenCerts $template definition (TradeTrust naming)
    template: {
      name: "professional-certificate",
      type: "EMBEDDED_RENDERER",
      url: "https://certificates.openattestation.com",
      version: "2.0.0",
    },
  },
  CompletionCertificate: {
    name: "Certificate of Completion",
    description: "Awarded for attending workshops and seminars",
    validForYears: 1,
    template: {
      name: "completion-certificate",
      type: "EMBEDDED_RENDERER",
      url: "https://certificates.openattestation.com",
      version: "2.0.0",
    },
  },
  AchievementCertificate: {
    name: "Certificate of Achievement",
    description: "Recognizes outstanding performance and achievements",
    validForYears: 3,
    template: {
      name: "achievement-certificate",
      type: "EMBEDDED_RENDERER",
      url: "https://certificates.openattestation.com",
      version: "2.0.0",
    },
  },
} as const;

// ──────────────────────────────────────────────────────
// Embedded JSON-LD Contexts (replaces unreachable remote URLs)
// The following contexts were previously fetched from
// https://schema.openattestation.com/ and
// https://templates.openattestation.com/, which are not
// reachable from all environments.  They are now embedded
// inline to eliminate network dependency during signing.
// ──────────────────────────────────────────────────────

/**
 * Inline equivalent of `https://schema.openattestation.com/openattestation.jsonld`.
 * Defines the OpenCerts type hierarchy so that jsonld-signatures can resolve
 * `OpenCertsCertificate` and `OpenCertsDiploma` without fetching a remote URL.
 */
export const OPENCERTS_CONTEXT = {
  "@context": {
    "@version": 1.1,
    "@protected": true,
    OpenCertsCertificate: {
      "@id": "https://schema.openattestation.com/OpenCertsCertificate",
      "@context": {
        "@version": 1.1,
        "@protected": true,
        id: "@id",
        type: "@type",
        certificateId: "https://schema.openattestation.com/certificateId",
        templateId: "https://schema.openattestation.com/templateId",
        name: "https://schema.org/name",
        issuer: {
          "@id": "https://schema.openattestation.com/issuer",
          "@type": "@id",
        },
        issuedOn: {
          "@id": "https://schema.openattestation.com/issuedOn",
          "@type": "http://www.w3.org/2001/XMLSchema#date",
        },
      },
    },
    OpenCertsDiploma: {
      "@id": "https://schema.openattestation.com/OpenCertsDiploma",
      "@context": {
        "@version": 1.1,
        "@protected": true,
        id: "@id",
        type: "@type",
        certificateId: "https://schema.openattestation.com/certificateId",
        templateId: "https://schema.openattestation.com/templateId",
        name: "https://schema.org/name",
        issuer: {
          "@id": "https://schema.openattestation.com/issuer",
          "@type": "@id",
        },
        issuedOn: {
          "@id": "https://schema.openattestation.com/issuedOn",
          "@type": "http://www.w3.org/2001/XMLSchema#date",
        },
        admissionDate: {
          "@id": "https://schema.openattestation.com/admissionDate",
          "@type": "http://www.w3.org/2001/XMLSchema#date",
        },
        graduationDate: {
          "@id": "https://schema.openattestation.com/graduationDate",
          "@type": "http://www.w3.org/2001/XMLSchema#date",
        },
        recipient: {
          "@id": "https://schema.openattestation.com/recipient",
          "@type": "@id",
        },
        course: "https://schema.org/course",
      },
    },
  },
} as const;

/**
 * Inline equivalent of `https://schema.openattestation.com/definitions/schema-openattestation-v2.json`.
 * Provides a JSON Schema that describes the structure of an OpenAttestation
 * credential. Used in `@context` so that W3C VC verifiers can validate
 * the schema without fetching a remote resource.
 */
export const OPENCERTS_SCHEMA_V2_CONTEXT = {
  "@context": {
    "@vocab": "https://schema.openattestation.com/",
    "@version": 1.1,
    "@protected": true,
    credentialSchema: {
      "@id": "https://www.w3.org/2018/credentials#credentialSchema",
    },
  },
} as const;

/** @deprecated Use `OPENCERTS_CONTEXT` inline object instead. Kept for backward compatibility. */
export const OPENCERTS_SCHEMA_URLS = {
  credentialDefinition:
    "https://schema.openattestation.com/openattestation.jsonld",
  credentialTemplate: "https://templates.openattestation.com/opencerts/v1",
  credentialSchemaOpenCertsV2:
    "https://schema.openattestation.com/definitions/schema-openattestation-v2.json",
} as const;

/** The full `@context` array to use when building OpenCerts credentials. */
export const OPENCERTS_CREDENTIAL_CONTEXT = [
  "https://www.w3.org/ns/credentials/v2",
  "https://w3id.org/security/data-integrity/v2",
] as const;

// OpenCerts credential subject field mapping (internal name → canonical field).
// NOTE: "id" is reserved for JSON-LD subject identity (@id), so certificateId maps
// to "certificateId" (the tradetrust.io schema field), not to "id".
export const OPEN_CERTS_SUBJECT_FIELD_MAP = {
  certificateId: "certificateId",
  certificateType: "type",
  templateId: "templateId",
  recipientName: "name",
  recipientEmail: "email",
  description: "description",
} as const;

// Credential subject field definitions for the OpenCerts JSON-LD context
export const OPENCERTS_SUBJECT_CONTEXT_FIELDS = {
  id: "https://schema.org/identifier",
  name: "https://schema.org/name",
  email: "https://schema.org/email",
  type: "https://schema.org/Thing",
  description: "https://schema.org/description",
  certificateId:
    "https://schemas.tradetrust.io/credentials#certificateId",
  certificateType:
    "https://schemas.tradetrust.io/credentials#certificateType",
  templateId: "https://schemas.tradetrust.io/credentials#templateId",
} as const;

// TrustVC configuration used in VC payloads
export const TRUSTVC_CONFIG = {
  didUrl: `did:web:verifiable.sg`,
  revocation: {
    type: "OCSP_RESPONDER" as const,
    // Open Attestation OCSP Responder for DID revocation.
    location:
      process.env.NEXT_PUBLIC_DID_REVOCATION_LOCATION ||
      "https://ocsp-sandbox.openattestation.com",
  },
  demoIssuer: {
    identityProof: {
      location: DOCUMENT_STORE_CONFIG.identityProof.location,
    },
  },
};

// Demo certificates for gallery
export const DEMO_CERTIFICATES = [
  {
    id: "demo-cert-001",
    templateId: "classic",
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
    templateId: "modern",
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
    templateId: "minimal",
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

// Deployment steps for TradeTrust compliance
export const DEPLOYMENT_STEPS = [
  {
    step: 1,
    title: "Deploy Document Store",
    description: "Deploy a document store smart contract on Sepolia testnet",
    action: "Deploy",
    link: "https://sepolia.etherscan.io/address/0x4B30674f8F77C0b1Ab4C8A34b2a85C295A3aE2D4",
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
