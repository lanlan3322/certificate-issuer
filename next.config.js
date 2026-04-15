/** @type {import('next').NextConfig} */
const webpack = require("webpack");

const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: "/certificate-issuer",
  webpack: (config, { isServer }) => {
    // Ignore optional native addons used by TrustVC dependencies
    // that are not available in browser environments
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^rdf-canonize-native$/,
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^@mattrglobal\/node-bbs-signatures$/,
      })
    );

    if (!isServer) {
      // Provide fallbacks for Node.js modules used by @trustvc/trustvc
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        dns: false,
        "node:crypto": false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;