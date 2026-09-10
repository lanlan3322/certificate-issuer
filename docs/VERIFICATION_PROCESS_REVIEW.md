# Verification Process Review - verifiable.sg

## Overview
This document details the certificate verification process implemented in the verifiable.sg system, focusing on how W3C Verifiable Credentials are validated using the TrustVC SDK and did:web DID method.

## Verification Process

### API Endpoint
- **Endpoint**: `/api/verify`
- **Method**: POST
- **Authentication Required**: No (public endpoint)
- **Request Format**: JSON with credential to verify

### Request Parameters
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
  }
}
```

### Response Format
```json
{
  "valid": true,
  "details": {
    "issuer": "did:web:verifiable.sg",
    "issuanceDate": "string (ISO date)",
    "credentialSubject": {
      "certificateId": "string"
    },
    "proof": {
      "type": "EcdsaSecp256k1Signature2023",
      "verificationMethod": "did:web:verifiable.sg#key-1"
    }
  }
}
```

## Implementation Details

### TrustVC SDK Integration
The system uses the TrustVC SDK v2.15.2 for:
- Verifying W3C Verifiable Credentials
- Resolving DID documents for verification
- Validating cryptographic proofs using ECDSA-Signature-Suite-2023

### DID Resolution Process
1. **DID Identification**: Extract DID from credential issuer field
2. **Document Retrieval**: Fetch DID document from `did:web:verifiable.sg`
3. **Key Validation**: Verify proof signature against public key in DID document
4. **Credential Validation**: Validate credential structure and content

### Verification Steps
1. Parse incoming credential
2. Extract issuer DID 
3. Resolve DID document via `did:web` method
4. Validate cryptographic proof using public key
5. Check credential structure and validity dates
6. Return verification result

## Security Implementation

### Authentication
- Verification is a public endpoint (no authentication required)
- Designed to allow anyone to verify credentials
- No rate limiting implemented on verification endpoint (as it's public)

### Data Protection
- No sensitive data stored during verification process
- All validation happens in-memory
- No credential data persisted after verification

### Integrity Checks
- Proof signature validation using ECDSA-Signature-Suite-2023
- DID document authenticity verified
- Credential structure validated against W3C standards
- Time-based validity checks performed

## Compatibility Assessment

### TradeTrust Compatibility
The system maintains full compatibility with TradeTrust verification through:
- Implementation of W3C Verifiable Credentials standard
- Support for TradeTrust's credential format
- Proper DID resolution and signature validation
- Standard verification response structure

### OpenCerts Compatibility
The system ensures compatibility with OpenCerts verification through:
- W3C Verifiable Credentials compliance
- Standard certificateId and name fields
- Proper proof mechanism that OpenCerts expects
- Response format compatible with OpenCerts verification API

## Error Handling

### Common Verification Errors
- `400 Bad Request`: Invalid credential structure
- `404 Not Found`: DID document not found or invalid
- `422 Unprocessable Entity`: Credential signature validation failed
- `500 Internal Server Error`: System errors during verification

### Validation Checks
- Credential type and context validation
- DID format and resolution validation  
- Proof signature verification
- Validity date range checks
- Required fields presence validation

## Performance Considerations

### Processing Time
- Verification typically completes within 1-3 seconds
- DID resolution handled efficiently via caching
- Database lookups for credential history (if enabled)
- Memory usage minimal for verification process

### Scalability
- Stateless API design allows horizontal scaling
- No database writes during verification
- Asynchronous processing for complex validation
- CDN-optimized DID document retrieval

## Integration with Certificate Issuance

### Cross-System Consistency
The verification system maintains consistency with issuance through:
- Same TrustVC SDK version used for both processes
- Identical DID resolution method (did:web)
- Shared cryptographic suite (ECDSA-Signature-Suite-2023)
- Common credential structure and field definitions

### Document Hash Verification
For enhanced security, the system supports document hash verification:
- Issued credentials include document hashes
- Verification can compare against stored document hash
- Additional integrity check beyond signature validation

## Testing and Quality Assurance

### Test Coverage
- Unit tests for verification logic
- Integration tests for DID resolution
- Edge case testing for malformed credentials
- Performance testing with large credential sets

### Monitoring
- Verification request tracking
- Error rate monitoring
- Response time metrics
- System availability checks

## Future Improvements

### Enhancement Opportunities
1. Add support for additional cryptographic suites beyond ECDSA-Signature-Suite-2023
2. Implement caching for DID document resolution to improve performance
3. Add more detailed error messages for debugging verification failures
4. Support batch verification of multiple credentials
5. Implement advanced features like credential revocation checking
6. Add support for additional DID methods beyond did:web