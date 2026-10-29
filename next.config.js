/** @type {import('next').NextConfig} */
const path = require("path");
const { traceCredentialRuntime } = require("./scripts/trace-credential-runtime");

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

const baselineSecurityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  images: { unoptimized: true },
  trailingSlash: true,
  async headers() {
    return [
      { source: "/:path*", headers: baselineSecurityHeaders },
      {
        source: "/((?!renderer(?:/|$)).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
  serverExternalPackages: [
    // @trustvc packages - they bundle native Node.js code and pull in ESM deps
    "@trustvc/trustvc",
    "@trustvc/w3c-context",
    // @digitalbazaar packages are native ESM. Keeping them external lets Node's
    // require() handle interop instead of webpack/bundler (which loses named
    // exports on ESM namespace objects). Combined with the patched _interopNamespace
    // in w3c-vc/dist/lib/w3c-vc.js, this prevents:
    //   "createEcdsaSd2023VerifyCryptosuite is not a function"
    "@digitalbazaar/ecdsa-sd-2023-cryptosuite",
    "@digitalbazaar/bbs-2023-cryptosuite",
    "@digitalbazaar/data-integrity",
    "@digitalbazaar/ecdsa-multikey",
    "@digitalbazaar/bls12-381-multikey",
  ],
  outputFileTracingExcludes: {
    "/*": ["./docs/**/*", "./audits/**/*", "./output/**/*", "./broadcast/**/*",
      "./out/**/*", "./cache/**/*", "./test-data/**/*", "./samples/**/*",
      "./memory/**/*"],
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  // Trailing-slash redirects are issued by proxy.ts so public verifier documents
  // can be served at their signed URLs without a CORS-less redirect hop.
  skipTrailingSlashRedirect: true,
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

module.exports = async () => {
  const runtimeFiles = await traceCredentialRuntime();
  return {
    ...nextConfig,
    outputFileTracingIncludes: {
      "/api/issue": runtimeFiles,
      "/api/verify": runtimeFiles,
      "/api/status-list/*/*": runtimeFiles,
    },
  };
};
