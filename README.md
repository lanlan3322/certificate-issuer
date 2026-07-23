# Certificate Issuer — TrustVC + IMDA

A modern web application for issuing **W3C Verifiable Credentials** certificates using the TrustVC SDK, managed by Singapore's IMDA (Infocomm Media Development Authority). Deployed as a static site on GitHub Pages at:

**https://lanlan3322.github.io/certificate-issuer/**

![Certificate Issuer](https://img.shields.io/badge/TrustVC-IMDA-blue)
![W3C VC](https://img.shields.io/badge/W3C-Verifiable%20Credentials-green)
![Next.js](https://img.shields.io/badge/Next.js-14-black)

## Features

- 📜 **Issue DID Certificates** — Sign W3C Verifiable Credentials with `ecdsa-sd-2023` using a configured `did:web` key pair
- ⛓️ **Issue Ethereum Certificates** — Hash credentials and issue them to an OpenAttestation Document Store on Sepolia testnet via MetaMask
- 🗂️ **Batch ZIP Download** — Import from Excel / CSV and issue a whole batch at once
- ✅ **Verify Certificates** — Paste JSON or upload file to verify authenticity
- 🖼️ **Certificate Gallery** — Browse sample certificates
- 📱 **QR Code Verification** — Scan QR code to verify certificate
- 🔗 **On-Chain Verification** — Document hashes stored on Ethereum for tamper-proof records

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript, static export)
- **Styling:** Tailwind CSS
- **TrustVC SDK:** `@trustvc/trustvc` for W3C VC signing
- **Blockchain:** Ethereum Sepolia testnet (OpenAttestation Document Store)
- **Wallet:** MetaMask (browser wallet via ethers.js v5)
- **Deployment:** GitHub Pages via GitHub Actions

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- Git
- MetaMask browser extension (for Ethereum issuance)

### Installation

```bash
# Clone the repository
git clone https://github.com/lanlan3322/certificate-issuer.git
cd certificate-issuer

# Install dependencies
npm install

# Copy environment file and configure (see "Environment Variables" section)
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000/certificate-issuer](http://localhost:3000/certificate-issuer) to view the app.

> **Note:** The app uses `basePath: "/certificate-issuer"` to match the GitHub Pages URL. Locally, the dev server serves the app at `/certificate-issuer/`.

### Build for Production

```bash
npm run build
```

Output will be in the `out/` directory (static export, ready for GitHub Pages).

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values.

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_DID_KEY_ID` | Full DID key URL, e.g. `did:web:example.com#key-1` | DID signing only |
| `NEXT_PUBLIC_DID_CONTROLLER` | DID controller URI | DID signing only |
| `NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE` | Base58btc-encoded ECDSA secp256k1 public key | DID signing only |
| `NEXT_PUBLIC_DID_PRIVATE_KEY_MULTIBASE` | Base58btc-encoded ECDSA secp256k1 private key | DID signing only |
| `NEXT_PUBLIC_DOCUMENT_STORE_ADDRESS` | Ethereum DocumentStore contract address | Ethereum issuance |

> ⚠️ **Security note:** `NEXT_PUBLIC_*` variables are bundled into the static JS files served by GitHub Pages. Anyone who downloads the page can read them. **Only use demo or test key pairs here.** For a production issuer service, implement a backend signing API instead.

### Generating a DID Key Pair

```bash
node -e "
const { generateKeyPair } = require('@trustvc/w3c-issuer');
generateKeyPair({ type: 'ecdsa-sd-2023' }).then(kp => {
  console.log('KEY_ID       :', 'did:web:YOUR-USERNAME.github.io:certificate-issuer#key-1');
  console.log('CONTROLLER   :', 'did:web:YOUR-USERNAME.github.io:certificate-issuer');
  console.log('PUBLIC KEY   :', kp.publicKeyMultibase);
  console.log('PRIVATE KEY  :', kp.secretKeyMultibase);
});
"
```

Replace `YOUR-USERNAME` with your GitHub username. Copy the output values into the corresponding `NEXT_PUBLIC_DID_*` variables in `.env.local`.

After generating the key pair, update `public/.well-known/did.json` with the `publicKeyMultibase` value so verifiers can resolve the DID document.

## How to Issue DID Certificates

1. Configure the `NEXT_PUBLIC_DID_*` environment variables (see above).
2. Open the app.
3. Select **DID** as the issuing method (it is selected by default).
4. Fill in the recipient details.
5. Click **Issue Certificate**.
6. The credential will be signed using `ecdsa-sd-2023` and the JSON output will include a `proof` block.
7. Download or copy the signed credential JSON.

**Without DID keys configured:** The credential is still generated as an unsigned draft (no `proof`). This is useful for previewing the payload.

## How to Issue Ethereum Certificates

1. Install MetaMask and add the Sepolia testnet.
2. Get test ETH from [https://sepoliafaucet.com](https://sepoliafaucet.com).
3. The wallet must be the **owner** or have **issuer role** on the configured DocumentStore contract.
   - The default demo store (`0x4B30674...`) is read-only for outside wallets.
   - Deploy your own store: [https://docs.tradetrust.io/docs/how-tos/deployment](https://docs.tradetrust.io/docs/how-tos/deployment).
4. Connect MetaMask in the app (it will prompt you to switch to Sepolia).
5. Select **Ethereum** as the issuing method.
6. Fill in the recipient details.
7. Click **Issue Certificate** and confirm the MetaMask transaction.
8. After the transaction is mined, a Sepolia Etherscan link to the transaction is displayed.

**Error states handled:**
- Wallet not connected → prompt before allowing issuance
- Wrong network → automatic prompt to switch to Sepolia
- Document already issued → clear error message
- Transaction rejected → user-friendly message
- Insufficient ETH → faucet link suggested

## Deploy to GitHub Pages

### Initial Setup

1. Fork or clone this repository to your GitHub account.
2. Go to **Settings → Pages** in your GitHub repository.
3. Under "Source", select **GitHub Actions**.

### Automated Deployment

Every push to `main` triggers the GitHub Actions workflow (`.github/workflows/deploy.yml`) which:
1. Runs `npm run build`
2. Uploads the `out/` directory
3. Deploys to `https://<username>.github.io/certificate-issuer/`

### Required Secrets (for DID signing on Pages)

Add these in **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|-------------|-------|
| `NEXT_PUBLIC_DID_KEY_ID` | Your DID key URL |
| `NEXT_PUBLIC_DID_CONTROLLER` | Your DID controller URI |
| `NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE` | Your ECDSA public key |
| `NEXT_PUBLIC_DID_PRIVATE_KEY_MULTIBASE` | Your ECDSA private key (**⚠️ treat as confidential**) |

Then update the workflow to pass these as env vars during `npm run build`:

```yaml
- name: Build
  run: npm run build
  env:
    NEXT_PUBLIC_DID_KEY_ID: ${{ secrets.NEXT_PUBLIC_DID_KEY_ID }}
    NEXT_PUBLIC_DID_CONTROLLER: ${{ secrets.NEXT_PUBLIC_DID_CONTROLLER }}
    NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE: ${{ secrets.NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE }}
    NEXT_PUBLIC_DID_PRIVATE_KEY_MULTIBASE: ${{ secrets.NEXT_PUBLIC_DID_PRIVATE_KEY_MULTIBASE }}
```

## Project Structure

```
certificate-issuer/
├── app/
│   ├── page.tsx           # Issue certificate page (DID + Ethereum flows)
│   ├── verify/page.tsx    # Verify certificate page
│   ├── gallery/page.tsx   # Certificate gallery
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Tailwind styles
├── components/
│   ├── NavBar.tsx          # Navigation component
│   ├── BatchIssuePanel.tsx # Batch issuance panel
│   ├── DeploymentGuide.tsx # Deployment guide accordion
│   └── IssuingMethodSelector.tsx  # DID / Ethereum method picker
├── hooks/
│   └── useWalletConnection.ts  # MetaMask wallet hook (ethers v5)
├── lib/
│   ├── constants.ts        # Network config, document store, templates
│   ├── trustvc.ts          # TrustVC SDK wrappers + DID/Ethereum issuance
│   ├── certificate.ts      # Certificate utilities (validate, download, zip)
│   ├── batchParse.ts       # Excel/CSV batch parsing
│   └── stubs/empty.js      # Webpack stub for Node.js-only native modules
├── public/
│   └── .well-known/did.json  # DID document for did:web resolution
├── .env.example            # Environment variable documentation
├── .github/workflows/
│   └── deploy.yml          # GitHub Actions deployment
├── next.config.js          # Next.js config (basePath, static export, webpack aliases)
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## TrustVC Integration

### What is TrustVC?

TrustVC is an open-source framework managed by IMDA for issuing and verifying W3C Verifiable Credentials. It provides:

- **W3C VC Data Model v2.0** compliant credentials
- **ECDSA-SD-2023** cryptographic signing
- **BBS-2023** for selective disclosure
- **OpenAttestation** document store integration for on-chain verification

### Key Functions Used

```typescript
import { signW3C } from '@trustvc/trustvc/w3c';

// Sign a credential (requires configured key pair via NEXT_PUBLIC_DID_* env vars)
const result = await signW3C(credential, keyPair);
if (result.signed) {
  // result.signed contains the credential with proof
}
```

For Ethereum issuance, the app uses ethers.js directly with a minimal DocumentStore ABI:

```typescript
const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(JSON.stringify(credential)));
const contract = new ethers.Contract(documentStoreAddress, DOCUMENT_STORE_ABI, signer);
const tx = await contract.issue(hash);
const receipt = await tx.wait();
// receipt.transactionHash is the on-chain proof
```

## Smart Contract

The app uses the **OpenAttestation Document Store** pattern on Ethereum:

- **Network:** Sepolia testnet (chainId: 11155111)
- **Document Store:** Ethereum smart contract for issuing/revoking document hashes
- **Default address:** `0x4B30674f8F77C0b1aB4c8A34B2a85C295A3aE2D4` (demo only — outside wallets cannot issue)

For production, deploy your own Document Store and update `.env.local`:
```
NEXT_PUBLIC_DOCUMENT_STORE_ADDRESS=0xYourContractAddress
```

## Known Limitations and Security Notes

1. **Private key in static bundle:** `NEXT_PUBLIC_*` variables are inlined into the browser JavaScript. The DID private key is therefore visible to anyone who downloads the page. This is acceptable for demos/testing; for production use a server-side signing endpoint.

2. **Demo document store:** The default document store contract (`0x4B30674...`) was deployed for demonstration purposes and the owner wallet is not publicly known. Ethereum issuance from outside wallets will fail the pre-check. Deploy your own store for real issuance.

3. **DID document resolution:** Verifiers using `did:web` resolution will fetch `https://lanlan3322.github.io/certificate-issuer/.well-known/did.json`. This file must contain the correct `publicKeyMultibase` for verification to succeed.

4. **No revocation backend:** Credential revocation via BitstringStatusList requires a hosted status list credential. The status list URL in the payload (`https://tradetrust.io/status/...`) is a placeholder.

## Troubleshooting

### Build fails with "Module not found"
```bash
npm rebuild
rm -rf .next && npm run build
```

### DID credentials always unsigned
Ensure the `NEXT_PUBLIC_DID_*` variables are set in `.env.local` and you have rebuilt (`npm run build`).

### MetaMask not detected
Install MetaMask from [https://metamask.io/download/](https://metamask.io/download/).

### Ethereum issuance fails with "pre-check failed"
Your wallet address must be the owner or have the ISSUER_ROLE on the document store. See [TradeTrust deployment guide](https://docs.tradetrust.io/docs/how-tos/deployment).

### GitHub Pages not updating
- Verify GitHub Actions ran successfully under the **Actions** tab.
- Check that GitHub Pages source is set to **GitHub Actions** (not a branch).

## References

- [TrustVC Official Site](https://trustvc.io)
- [TrustVC GitHub](https://github.com/TrustVC)
- [OpenCerts Documentation](https://docs.opencerts.io)
- [W3C Verifiable Credentials](https://www.w3.org/TR/vc-data-model/)
- [OpenAttestation / TradeTrust](https://docs.tradetrust.io)
- [IMDA Digital Utilities](https://imda.gov.sg/how-we-can-help/digital-utilities)

## License

Apache License 2.0