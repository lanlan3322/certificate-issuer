/** @type {import('next').NextConfig} */
const path = require("path");

const deployTarget = process.env.DEPLOY_TARGET || "vercel";
const isGitHubPages = deployTarget === "github-pages";
const basePath = isGitHubPages ? "/certificate-issuer" : "";

// Node.js-only modules transitively imported by @trustvc packages but never
// actually used in the browser.
const stubbedModules = [
  // dotenv/config is loaded by @trustvc/trustvc/utils/supportedChains
  "dotenv/config",
  // core-js v2 shim needed only for Node.js < 8.6; safe to stub in browser
  "core-js/fn/object/entries",
  // BBS signature native module — only needed for BBS crypto suite (not used here)
  "@mattrglobal/node-bbs-signatures",
  // rdf-canonize-native is an optional C++ accelerator; pure-JS fallback is used
  "rdf-canonize-native",
];


const nextConfig = {
  // Vercel runs the Next.js server runtime for auth, PostgreSQL, and API routes.
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  serverExternalPackages: [
    "@trustvc/trustvc",
    "@trustvc/w3c-context",
  ],
  outputFileTracingIncludes: {
    "/api/issue": [
      "./node_modules/@trustvc/**/*",
      "./node_modules/@tradetrust-tt/**/*",
      "./node_modules/@digitalbazaar/**/*",
      "./node_modules/@mattrglobal/**/*",
      "./node_modules/did-resolver/**/*",
      "./node_modules/web-did-resolver/**/*",
      "./node_modules/jsonld/**/*",
      "./node_modules/jsonld-signatures/**/*",
      "./node_modules/cbor/**/*",
      "./node_modules/dotenv/**/*",
      "./node_modules/ethers/**/*",
      "./node_modules/ethersV6/**/*",
      "./node_modules/@ethersproject/**/*",
      "./node_modules/aes-js/**/*",
      "./node_modules/bn.js/**/*",
      "./node_modules/elliptic/**/*",
      "./node_modules/brorand/**/*",
      "./node_modules/hash.js/**/*",
      "./node_modules/hmac-drbg/**/*",
      "./node_modules/inherits/**/*",
      "./node_modules/minimalistic-assert/**/*",
      "./node_modules/minimalistic-crypto-utils/**/*",
    ],
    "/api/verify": [
      "./node_modules/@trustvc/**/*",
      "./node_modules/@tradetrust-tt/**/*",
      "./node_modules/@digitalbazaar/**/*",
      "./node_modules/@mattrglobal/**/*",
      "./node_modules/did-resolver/**/*",
      "./node_modules/web-did-resolver/**/*",
      "./node_modules/jsonld/**/*",
      "./node_modules/jsonld-signatures/**/*",
      "./node_modules/cbor/**/*",
      "./node_modules/dotenv/**/*",
      "./node_modules/ethers/**/*",
      "./node_modules/ethersV6/**/*",
      "./node_modules/@ethersproject/**/*",
      "./node_modules/aes-js/**/*",
      "./node_modules/bn.js/**/*",
      "./node_modules/elliptic/**/*",
      "./node_modules/brorand/**/*",
      "./node_modules/hash.js/**/*",
      "./node_modules/hmac-drbg/**/*",
      "./node_modules/inherits/**/*",
      "./node_modules/minimalistic-assert/**/*",
      "./node_modules/minimalistic-crypto-utils/**/*",
    ],
    "/api/debug-trustvc": [
      "./node_modules/@trustvc/**/*",
      "./node_modules/@tradetrust-tt/**/*",
      "./node_modules/@digitalbazaar/**/*",
      "./node_modules/@mattrglobal/**/*",
      "./node_modules/did-resolver/**/*",
      "./node_modules/web-did-resolver/**/*",
      "./node_modules/jsonld/**/*",
      "./node_modules/jsonld-signatures/**/*",
      "./node_modules/cbor/**/*",
      "./node_modules/dotenv/**/*",
      "./node_modules/ethers/**/*",
      "./node_modules/ethersV6/**/*",
      "./node_modules/@ethersproject/**/*",
      "./node_modules/aes-js/**/*",
      "./node_modules/bn.js/**/*",
      "./node_modules/elliptic/**/*",
      "./node_modules/brorand/**/*",
      "./node_modules/hash.js/**/*",
      "./node_modules/hmac-drbg/**/*",
      "./node_modules/inherits/**/*",
      "./node_modules/minimalistic-assert/**/*",
      "./node_modules/minimalistic-crypto-utils/**/*",
    ],
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  turbopack: {
    resolveAlias: Object.fromEntries(
      stubbedModules.map((name) => [name, "./lib/stubs/empty.js"])
    ),
  },
  webpack: (config) => {
    const stubPath = path.resolve(__dirname, "lib/stubs/empty.js");
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(stubbedModules.map((name) => [name, stubPath])),
    };
    return config;
  },
};

module.exports = nextConfig;
