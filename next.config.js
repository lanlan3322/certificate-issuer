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

const trustvcRuntimeTraceIncludes = ["./node_modules/**/*"];

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
    "/api/issue": trustvcRuntimeTraceIncludes,
    "/api/verify": trustvcRuntimeTraceIncludes,
    "/api/debug-trustvc": trustvcRuntimeTraceIncludes,
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
