# w3c-VC ESM/CJS Interop Fix

## Problem

`@trustvc/w3c-vc` is a CommonJS package that re-exports from native ESM modules (`@digitalbazaar/ecdsa-sd-2023-cryptosuite`, etc.). Its `_interopNamespace` helper uses `require()` to load these modules.

When Node.js 18+ loads an ESM module via a CJS `require()`:
1. The module is wrapped and gets `__esModule: true` on its namespace object
2. The original package checks `__esModule` and returns the namespace as-is
3. But native ESM namespaces set properties as **data descriptors**, not getters
4. So destructuring (`const { createEcdsaSd2023VerifyCryptosuite } = ns`) fails to resolve named exports

This manifests as:
- `createEcdsaSd2023VerifyCryptosuite` is `undefined` at runtime
- Verifiable credential issuance fails silently or with crypto errors

## Solution Applied

### 1. Patch `_interopNamespace` in w3c-vc

File: `patches/@trustvc+w3c-vc+2.4.2.patch`

The fix wraps the ESM namespace object to properly forward property access via getters, making destructuring work correctly in both Node.js require() and bundled contexts.

### 2. Configure Next.js serverExternalPackages

File: `next.config.js` — `serverExternalPackages` array includes:
- `@trustvc/trustvc`
- `@trustvc/w3c-context`
- `@digitalbazaar/ecdsa-sd-2023-cryptosuite`
- `@digitalbazaar/bbs-2023-cryptosuite`
- `@digitalbazaar/data-integrity`
- `@digitalbazaar/ecdsa-multikey`
- `@digitalbazaar/bls12-381-multikey`

This prevents Next.js from bundling these native modules, which would break them further.

### 3. Remove circular dependency shim

The previous workaround (`lib/shims/ecdsa-sd-2023-cryptosuite.js`) that stubbed `@digitalbazaar/ecdsa-sd-2023-cryptosuite` to break a circular dependency has been removed — the w3c-VC patch resolves the root cause.

## Verification

The dev server starts cleanly and API routes import/export correctly:
```bash
npm run dev
curl http://localhost:3000/api/issue  # should not throw crypto errors
```

## Maintenance

If `@trustvc/w3c-vc` updates its version, re-run:
```bash
npx patch-package @trustvc/w3c-vc
```
Or manually re-apply the `_interopNamespace` fix from this document.

## Protected JSON-LD term conflict

The `w3c` format alias uses the OpenCerts context extensions. The base
`OPENCERTS_CONTEXT` protects `OpenCertsCertificate`, so the extensions must not
redefine that term with the legacy archive's different IRI. Keep the protected
base definition and omit the duplicate from `OPENCERTS_EXTRA_CONTEXTS`; do not
disable JSON-LD protection or signing safe mode.

Run the context and signing regression tests with Node.js 22.15+:

```bash
node --test lib/trustvc.test.js
```

These exercise all four format names with a template identifier and temporary
P-256 keys, without requiring configured production signing keys.

## Diagnosing safe-mode issuance failures

Signing keeps JSON-LD safe mode enabled. Errors now report a fixed validation
category, such as `invalid property` (missing context definition) or
`relative @id reference` (an identifier is not an absolute URI). The same
category appears in the server's `[safe-mode]` validation result. Event values,
which can contain recipient data, are not included in the diagnostic.

The regression tests cover FTA standard-mode issuance with Bitstring Status List
entries and embedded rendering, as used by the DID + Ethereum route before
wallet anchoring. This flow passes with temporary valid keys; that is not proof
that a production issuer's data or signing configuration is correct. If only a
new issuer fails, capture the specific category and check its saved template
and signing-profile mapping before changing contexts or key configuration.
