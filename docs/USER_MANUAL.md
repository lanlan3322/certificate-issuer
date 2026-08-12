# User Manual

## 1. Overview

This platform lets you issue and verify digital certificates as W3C Verifiable Credentials. It supports both:

- DID-based issuance using a public DID and cryptographic signing
- Ethereum-based issuance via a connected wallet and document store

The main user flows are:

- issue a certificate
- verify a certificate
- view example certificate templates
- download or share issued credential data

## 2. Accessing the platform

Open the application in the browser using the deployment URL or your local development instance.

Typical entry points:

- Home page: issue certificates
- Verify page: validate signed credential JSON
- Gallery page: browse examples and templates
- Admin page: issuer, status, and platform management

## 3. Issuing a certificate

### 3.1 Prepare the form

From the home page:

1. Enter the recipient name and email.
2. Select a certificate type.
3. Choose a template if available.
4. Fill in the certificate description.
5. Add validity dates if the certificate should expire.

### 3.2 Choose an issuing method

The platform supports the following methods:

- DID: best for signed credentials with a DID document and verifiable proof
- Ethereum: best for on-chain issuance tied to an Ethereum wallet and document store

Use DID when:

- you want a cryptographically signed credential
- you are publishing or validating credential proofs

Use Ethereum when:

- you need an on-chain record and document-store flow
- your wallet is connected to Sepolia and authorized for issuance

### 3.3 Issue with DID

1. Ensure your DID configuration is valid.
2. Select the DID method.
3. Complete the certificate fields.
4. Click Issue Certificate.
5. Review the generated credential JSON.

The issued credential includes a proof block if DID signing is enabled. If the required DID metadata is missing, the application will generate a draft payload instead of a signed credential.

### 3.4 Issue with Ethereum

1. Install and connect MetaMask.
2. Ensure the wallet is on the Sepolia test network.
3. Confirm you have sufficient Sepolia ETH.
4. Select the Ethereum method.
5. Complete the form and click Issue Certificate.
6. Confirm the transaction in MetaMask.

After mining, the app displays the transaction hash and confirmation details.

## 4. Downloading and sharing certificates

After issuance, you can:

- copy the credential payload
- download the generated certificate in JSON or bundle form
- share the credential with the recipient
- use the verification page to confirm the result

## 5. Verifying a credential

### 5.1 Verify from JSON

1. Open the Verify page.
2. Paste the credential JSON into the input field, or upload a file.
3. Click Verify.
4. Review the result for:
   - validity
   - signature status
   - revocation status
   - issuer trust state

### 5.2 Verify from an issued artifact

If you received a signed certificate file or JSON payload, open the verification flow and run the same check. The platform validates the proof and issuer details before marking the credential as valid.

## 6. Using the gallery

The gallery shows sample certificates and templates. Use it to:

- understand expected fields and layout
- preview certificate design patterns
- compare credential structures before issuance

## 7. Troubleshooting

### The certificate is not signed

This usually means the DID configuration is incomplete or not available in the current environment.

Check:

- DID key ID
- controller
- public key
- private key

### Wallet is not connected

Connect MetaMask and confirm the wallet is on the correct Ethereum network.

### Verification fails

Possible reasons:

- wrong JSON payload
- outdated or missing DID document
- invalid cryptographic proof
- credential was revoked or expired

## 8. Best practices

- Use test keys for demo or staging usage.
- Keep DID and revocation configuration accurate.
- Verify credentials before sending them to recipients.
- Do not expose private keys in browser-visible environment variables.
- Use production signing boundaries instead of browser-side secrets for live issuance.

## 9. Support and next steps

If you are acting as a recipient, verifier, or issuer, use the verification page, gallery, and issuance flow as your primary tools. For advanced platform control, see the Admin Manual.
