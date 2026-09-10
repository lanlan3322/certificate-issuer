# Certificate Issuance Review - verifiable.sg

## Overview
This document details the certificate issuance process implemented in the verifiable.sg system, focusing on the integration of W3C Verifiable Credentials with the TrustVC SDK and did:web DID method.

## Issuance Process

### API Endpoint
- **Endpoint**: `/api/issue`
- **Method**: POST
- **Authentication Required**: Yes (Issuer role required)
- **Request Format**: JSON with certificate data

### Request Parameters
```json
{
  "recipientName": "string",
  "recipientEmail": "string",
  "externalId": "string",
  "templateId": "string (optional)",
  "validFrom": "string (ISO date, optional)",
  "validUntil": "string (ISO date, optional)"
}
```

### Response Format
```json
{
  "credential": {
    "@context": ["https://www.w3.org/ns/credentials/v2", "..."],
    "id": "string",
    "type": ["VerifiableCredential", "..."],
    "issuer": "did:web:verifiable.sg",
    "issuanceDate": "string (ISO date)",
    "credentialSubject": {
      "id": "string",
      "name": "string",
      "certificateId": "string"
    },
    "proof": {
      "type": "EcdsaSecp256k1Signature2023",
      "created": "string (ISO date)",
      "verificationMethod": "did:web:verifiable.sg#key-1",
      "proofPurpose": "assertionMethod",
      "proofValue": "string"
    }
  },
  "documentHash": "string (optional)"
}
```

## Implementation Details

### TrustVC SDK Integration
The system uses the TrustVC SDK v2.15.2 for:
- Creating W3C Verifiable Credentials
- Signing credentials with ECDSA-Signature-Suite-2023
- Managing DID-based authentication

### DID-Based Issuance
- **DID Method**: `did:web:verifiable.sg`
- **Key Type**: ECDSA-Signature-Suite-2023 (secp256k1)
- **Signing Algorithm**: ECDSA with SHA-256

### Credential Structure
The issued credentials follow the W3C Verifiable Credentials standard:
- Uses `@context` from W3C and TrustVC specifications
- Includes proper credentialSubject structure with certificateId and name
- Implements proper proof mechanism using DID key

## Security Implementation

### Authentication Flow
1. User authenticates via Supabase
2. Role-based access control verified (requires issuer role)
3. Session maintained for duration of issuance process

### Data Protection
- All credentials stored in encrypted format in Supabase
- Private keys used for signing are managed securely
- Document hashes stored for verification purposes

### Rate Limiting
- Implemented to prevent credential stuffing attacks
- Configurable limits based on IP addresses and user identifiers

## Verification Integration

The issuance process integrates with the verification system:
- Issued credentials can be verified using `/api/verify` endpoint
- Verification uses the same TrustVC SDK and DID resolution
- Supports both direct verification and document hash comparison

## Compatibility Assessment

### TradeTrust Compatibility
The system implements full compatibility with TradeTrust through:
- W3C Verifiable Credentials standard compliance
- TrustVC SDK integration supporting TradeTrust format
- Proper DID-based issuance process
- Standard credential structure that TradeTrust expects

### OpenCerts Compatibility
The system maintains compatibility with OpenCerts through:
- Implementation of W3C Verifiable Credentials
- Standard certificate structure matching OpenCerts schema
- Support for verification via standard API endpoints
- Proper handling of certificateId and name fields

## Error Handling

### Common Errors
- `401 Unauthorized`: User not authenticated
- `403 Forbidden`: Insufficient permissions (requires issuer role)
- `409 Conflict`: Duplicate credential (externalId already used)
- `500 Internal Server Error`: System errors during processing

### Validation
- External ID uniqueness enforced
- Recipient name and email required
- Date formats validated
- Credential structure validated against schema

## Performance Considerations

### Processing Time
- Certificate issuance typically completes within 2-5 seconds
- DID resolution handled efficiently
- Database operations optimized for credential storage

### Scalability
- Supabase database handles concurrent requests
- Stateless API design allows horizontal scaling
- Asynchronous processing for complex operations

## Testing and Quality Assurance

### Test Coverage
- Unit tests for TrustVC integration
- Integration tests for API endpoints
- Authentication and authorization tests
- Credential validation tests

### Monitoring
- Error tracking implemented
- Performance metrics collected
- Audit logs maintained for all issuance activities

## Future Improvements

### Enhancement Opportunities
1. Add support for additional DID methods beyond did:web
2. Implement more comprehensive logging and audit trails
3. Add batch issuance capabilities
4. Expand compatibility with other verifiable credential standards
5. Improve error messages for better debugging experience