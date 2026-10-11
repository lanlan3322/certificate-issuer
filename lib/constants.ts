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
  address: "0x92600b6B5fE4D15D87d7d264C6cAdCcaf9D74594",
  
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
 * Provides a @vocab for OpenAttestation-specific term expansion. The credentialSchema
 * IRI is provided by the W3C VC v2 context (item 1 in OPENCERTS_CREDENTIAL_CONTEXT) so we
 * do not redefine it here — doing so would conflict with jsonld-signatures' strict merge mode.
 */
export const OPENCERTS_SCHEMA_V2_CONTEXT = {
  "@context": {
    "@vocab": "https://schema.openattestation.com/",
    "@version": 1.1,
    "@protected": true,
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

// ─── OpenCerts / TradeTrust credential type constants ──────────────────────
// These are consumed by buildVCPayload when `mode === "opencerts"`.

/** W3C + OA credential type tag required for TradeTrust/OpenCerts verifiers. */
export const OPENCERTS_CREDENTIAL_TYPE = "OpenAttestationDocument2018";

/** _type marker for the credentialSubject in OA mode. */
export const OPENCERTS_SUBJECT_TYPE = "OpenAttestationCredentialSubject";

/** @deprecated — unused; kept for reference only. */
export const OPENCERTS_PROOF_TYPE = "OpenAttestationAssertion2018";

/** @deprecated — unused; kept for reference only. */
export const OPENATTACKATION_SIGNATURE_TYPE = "OPENATTACKATION_JSON_LD_PROOF";

/** @deprecated — unused; kept for reference only. */
export const OPENCERTS_SIGNATURE_FORMAT = "OpenAttestationSignedDocument";

/** Inline JSON-LD context definitions for OpenCerts / TradeTrust mode credentials.

  These replace previously-fetched external URLs that are no longer accessible
  (opencredentials.github.io archive shutdown, opentrust.org / comprobante DNS gone).

  Each element can be a URL string (for remote dereferencing) or a plain object
  whose properties are merged into the active @context during JSON-LD processing.
*/
export const OPENCERTS_EXTRA_CONTEXTS = [
  {
    "@context": {
      "OpenCertsCertificate": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/OpenCertsCertificate",
      "name": "https://schema.org/name",
      "description": "https://schema.org/description",
      "issuedOn": "https://schema.org/dateIssued",
      "admissionDate": {
        "@id": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/admissionDate",
        "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
      },
      "graduationDate": {
        "@id": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/graduationDate",
        "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
      },
      "recipient": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/recipient",
      "nric": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/nric",
      "course": "https://schema.org/courseName",
      "transcript": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/transcript",
      "grade": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/grade",
      "courseCredit": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/courseCredit",
      "courseCode": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/courseCode",
      "examinationDate": {
        "@id": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/examinationDate",
        "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
      },
      "semester": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/semester",
      "additionalData": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/additionalData",
      "merit": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/merit",
      "studentId": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/studentId",
      "transcriptId": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/transcriptId",
      "certSignatories": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/certSignatories",
      "signature": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/signature",
      "position": "https://schema.org/jobTitle",
      "organisation": "https://opencredentials.github.io/long-term-archive/contexts/opencerts/organisation",
    },
  } as const,
] as const;

/** Inline context for OpenTrust DSS format 1.0 — replaces the now-inaccessible
 * https://opentrust.org/schema/dss/format/1.0/context.jsonld URL.
 */
export const OPENTRUST_DSS_CONTEXT = {
  "@context": {
    "dss": "https://opentrust.org/schema/dss/",
    "format": "https://opentrust.org/schema/dss/format/",
  },
} as const;

/** Inline context for Comprobante 1.0 — replaces the now-inaccessible
 * https://ts.openattestation.com/comprobante/1.0/context.json URL.
 */
export const COMPROBANTE_CONTEXT = {
  "@context": {
    "comprobante": "https://openpack.verifier.services/schema/1.0/",
    "issuerLegalName": "https://openpack.verifier.services/schema/1.0#legalName",
    "issueInstant": {
      "@id": "https://openpack.verifier.services/schema/1.0#instantOfIssue",
      "@type": "http://www.w3.org/2001/XMLSchema#dateTime",
    },
  },
} as const;

/** Token registry ID for the deployed OpenCerts deployment (empty = not yet configured). */
export const TOKEN_REGISTRY_ID = process.env.TOKEN_REGISTRY_ID ?? "";

/** Issuer name / metadata block used in `openCertsCertificateMetadata` when present. */
export const OPENCERTS_ISSUER_METADATA = {
  name: ISSUER_CONFIG.name,
  url: ISSUER_CONFIG.url,
  socket: process.env.NEXT_PUBLIC_DID_URL ?? "did:web:verifiable.sg",
} as const;
