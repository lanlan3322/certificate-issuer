# Fix Summary: OpenCerts Context URL Correction

## Issue
The certificate-issuer project was encountering the error: "Dereferencing a URL did not result in a valid JSON-LD object: https://www.opencerts.io/schema/v2/context.json" when attempting to issue certificates. This occurred because the OpenCerts context URL was incorrect, causing the JSON-LD processor to receive HTML content (likely the SPA index.html) instead of the expected JSON-LD context.

## Root Cause
The URL `https://www.opencerts.io/schema/v2/context.json` does not exist as a static file on the opencerts.io domain. When the JSON-Ld processor attempted to fetch this URL, the OpenCerts single-page application served its default HTML page instead, resulting in invalid JSON-Ld content.

## Solution
Changed the OpenCerts context URL in the `buildVCPayload` function from:
```
"https://www.opencerts.io/schema/v2/context.json"
```
to:
```
"https://w3id.org/opencerts/v2"
```

This change:
1. Uses the established W3ID persistent identifier service (consistent with the already-used security context URL)
2. Follows the same pattern as `"https://w3id.org/security/data-integrity/v2"`
3. Should resolve to the correct JSON-Ld context content with proper content-type headers
4. Eliminates the dereferencing error by using a properly configured identifier service

## File Modified
- `/Users/elc-laurence/Desktop/Laurence/eSystem/certificate-issuer/lib/trustvc.ts` (line ~72)

## Current Certificate Structure
The fixed `buildVCPayload` function now produces credentials with this context array:
```json
"@context": [
  "https://www.w3.org/ns/credentials/v2",
  "https://w3id.org/security/data-integrity/v2",
  "https://w3id.org/opencerts/v2"
]
```

This follows the established pattern for Verifiable Credentials contexts and should resolve the JSON-Ld dereferencing issue.