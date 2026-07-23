/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: "/certificate-issuer",
  webpack: (config) => {
    // Stub out Node.js-only modules that are transitively imported by
    // @trustvc packages but are never actually used in the browser.
    const stubPath = path.resolve(__dirname, "lib/stubs/empty.js");
    config.resolve.alias = {
      ...config.resolve.alias,
      // dotenv/config is loaded by @trustvc/trustvc/utils/supportedChains
      "dotenv/config": stubPath,
      // core-js v2 shim needed only for Node.js < 8.6; safe to stub in browser
      "core-js/fn/object/entries": stubPath,
      // BBS signature native module — only needed for BBS crypto suite (not used here)
      "@mattrglobal/node-bbs-signatures": stubPath,
      // rdf-canonize-native is an optional C++ accelerator; pure-JS fallback is used
      "rdf-canonize-native": stubPath,
    };
    return config;
  },
};

module.exports = nextConfig;