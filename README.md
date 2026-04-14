# Certificate Issuer — TrustVC + IMDA

A modern web application for issuing **W3C Verifiable Credentials** certificates using the TrustVC SDK, managed by Singapore's IMDA (Infocomm Media Development Authority).

![Certificate Issuer](https://img.shields.io/badge/TrustVC-IMDA-blue)
![W3C VC](https://img.shields.io/badge/W3C-Verifiable%20Credentials-green)
![Next.js](https://img.shields.io/badge/Next.js-14-black)

## Features

- 📜 **Issue Certificates** — Generate W3C Verifiable Credentials with recipient info
- ✅ **Verify Certificates** — Paste JSON or upload file to verify authenticity
- 🖼️ **Certificate Gallery** — Browse sample certificates
- 📱 **QR Code Verification** — Scan QR code to verify certificate
- 🔗 **On-Chain Verification** — Document hashes stored on Ethereum (Sepolia testnet)

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **Styling:** Tailwind CSS
- **TrustVC SDK:** `@trustvc/trustvc` for W3C VC signing/verification
- **Blockchain:** Ethereum Sepolia testnet (Document Store pattern)
- **Deployment:** GitHub Pages via GitHub Actions

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/certificate-issuer.git
cd certificate-issuer

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Build for Production

```bash
npm run build
```

Output will be in the `out/` directory (static export).

## Deploy to GitHub Pages

### Prerequisites

1. Install GitHub CLI:
   ```bash
   brew install gh
   ```

2. Authenticate:
   ```bash
   gh auth login
   ```

3. Create a new repository on GitHub:
   ```bash
   gh repo create certificate-issuer --public --push-source main
   ```

### Initial Setup

```bash
# Add remote (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/certificate-issuer.git

# Push to GitHub
git push -u origin main
```

### Enable GitHub Pages

1. Go to your repository on GitHub
2. Navigate to **Settings → Pages**
3. Under "Source", select **GitHub Actions**

The GitHub Actions workflow will automatically deploy on every push to `main`.

### Manual Deploy (Alternative)

```bash
# Build the static site
npm run build

# Initialize git (if not already)
git init
git add -A
git commit -m "Initial commit"

# Create repo on GitHub and push
gh repo create certificate-issuer --public --source=. --push
```

## Project Structure

```
certificate-issuer/
├── app/
│   ├── page.tsx           # Issue certificate page
│   ├── verify/page.tsx    # Verify certificate page
│   ├── gallery/page.tsx   # Certificate gallery
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Tailwind styles
├── components/
│   └── NavBar.tsx         # Navigation component
├── lib/
│   ├── constants.ts       # TrustVC config & demo data
│   ├── trustvc.ts         # TrustVC SDK wrappers
│   └── certificate.ts     # Certificate utilities
├── .github/workflows/
│   └── deploy.yml         # GitHub Actions deployment
├── package.json
├── tailwind.config.ts
├── next.config.js
└── tsconfig.json
```

## TrustVC Integration

### What is TrustVC?

TrustVC is an open-source framework managed by IMDA for issuing and verifying W3C Verifiable Credentials. It provides:

- **W3C VC Data Model v2.0** compliant credentials
- **ECDSA-SD-2023** cryptographic signing
- **BBS-2023** for selective disclosure
- **OpenAttestation** document store integration for on-chain verification

### Key Functions

```typescript
import { signW3C, verifyDocument, deriveW3C } from '@trustvc/trustvc';

// Sign a credential
const signedDoc = await signW3C(credential, keyPair);

// Verify (auto-derives if needed)
const result = await verifyDocument(signedDoc);

// Selective disclosure
const derived = await deriveW3C(signedDoc, { selectivePointers: ['/name'] });
```

## Certificate Data Model

```typescript
interface CertificateData {
  id: string;                    // UUID
  recipientName: string;
  recipientEmail: string;
  certificateType: string;       // e.g., "Professional Certificate"
  issuerName: string;
  issueDate: string;
  description: string;
  validFrom: string;
  validUntil?: string;
}
```

## Smart Contract

The app uses the **OpenAttestation Document Store** pattern on Ethereum:

- **Network:** Sepolia testnet (chainId: 11155111)
- **Document Store:** Ethereum smart contract for issuing/revoking document hashes

For production, deploy your own Document Store and update `lib/constants.ts`.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NET` | Ethereum network (`mainnet` or `sepolia`) | `sepolia` |

## Troubleshooting

### Build fails with "Module not found"
```bash
npm rebuild
```

### TypeScript errors
```bash
rm -rf .next && npm run build
```

### GitHub Pages not updating
- Verify GitHub Actions ran successfully under **Actions** tab
- Check that GitHub Pages source is set to **GitHub Actions**

## References

- [TrustVC Official Site](https://trustvc.io)
- [TrustVC GitHub](https://github.com/TrustVC)
- [OpenCerts Documentation](https://docs.opencerts.io)
- [W3C Verifiable Credentials](https://www.w3.org/TR/vc-data-model/)
- [IMDA Digital Utilities](https://imda.gov.sg/how-we-can-help/digital-utilities)

## License

Apache License 2.0