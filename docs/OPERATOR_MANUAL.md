# Operator Manual

## 1. Overview

This manual is for deployment and operations teams responsible for running the platform in local, staging, or production contexts.

## 2. Core platform responsibilities

Operators are responsible for:

- running the application and build pipeline
- configuring signing and wallet environment variables
- maintaining DID and document-store connectivity
- deploying and verifying production builds
- supporting security reviews and credential lifecycle monitoring

## 3. Local setup

### Prerequisites

- Node.js 20+
- npm or compatible package manager
- Git
- MetaMask for wallet-based flows

### Start the app

```bash
npm install
npm run dev
```

The app is typically served on the local route matching the repo’s base path configuration.

## 4. Build and deployment

### Standard build

```bash
npm run build
```

This project is designed for static export and is compatible with GitHub Pages deployment patterns.

### Deployment notes

Deployments should:

- publish the generated static output
- verify the public route resolves correctly
- validate DID document accessibility
- confirm verification flows work post-deployment

## 5. Environment configuration

Use environment variables for DID and wallet configuration. The most important values are:

- DID key ID
- DID controller
- public key multibase
- private key multibase
- revocation endpoint
- document store address

Important: browser-visible environment variables are not safe for production private keys. For live production use, move signing into a server-side boundary and keep secret material out of client code.

## 6. DID management

The platform relies on DID documents for verification and proof validation. Operators should ensure:

- the DID document is published and reachable
- the public key matches the configured issuer data
- the key ID and controller match the intended identity
- the revocation location is reachable if required

### DID document publication

Once generated, publish the DID document to the public endpoint expected by did:web resolution.

## 7. Ethereum and wallet flow

For wallet-based issuance:

- confirm the wallet is connected
- ensure the network is Sepolia
- confirm authorization on the document store
- verify the wallet has sufficient ETH
- confirm the issuance transaction completes before sharing the credential

## 8. Monitoring and operational checks

Review the platform after every release or configuration change:

- run a build
- verify the issue page renders correctly
- validate the verify page
- test a DID-issued credential
- test an Ethereum-issued credential when applicable
- confirm revocation and template flows are functioning

## 9. Security checklist

Before production rollout or ongoing operations, confirm:

- no private keys are embedded in public client code
- server-side signing boundaries are used where required
- revocation endpoints are reachable and trusted
- environment variables are not accidentally committed to source control
- all changes are tested in staging before production use

## 10. Common operational issues

### Build or static export fails

Check:

- Node version
- dependency installation
- configuration drift
- environment variable errors

### Verification fails in production

Check:

- DID public endpoint availability
- mismatch in DID document versus configured values
- invalid proof data
- revocation state mismatch

### Wallet issuance does not complete

Check:

- network selection
- wallet authorization
- document store configuration
- available ETH

## 11. Recommended lifecycle

A healthy operating cycle is:

1. validate environment variables
2. run the app build
3. test DID issuance
4. test Ethereum issuance
5. validate verification and revocation flows
6. publish the release
7. review audit results and support logs

## 12. Related guides

- [USER_MANUAL.md](USER_MANUAL.md)
- [ADMIN_MANUAL.md](ADMIN_MANUAL.md)
