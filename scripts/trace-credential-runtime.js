const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft");

// lib/trustvc.ts loads these through runtime wrappers invisible to Next's tracer.
const runtimeModules = [
  "@trustvc/trustvc",
  "@trustvc/w3c-context",
  "@trustvc/w3c-vc",
  "@trustvc/w3c-credential-status",
  "@digitalbazaar/ecdsa-multikey",
  "@digitalbazaar/ecdsa-sd-2023-cryptosuite",
  "@digitalbazaar/data-integrity",
  "jsonld-signatures",
];

async function traceCredentialRuntime() {
  const path = require("node:path");
  const root = path.resolve(__dirname, "..");
  const trace = await nodeFileTrace(runtimeModules.map((name) => require.resolve(name)), {
    base: root,
    processCwd: root,
    conditions: ["node"],
  });
  // These optional dependencies are already absent from the installed SDKs.
  const optionalDependency = /^(?:core-js\/fn\/object\/entries|rdf-canonize-native|encoding)$|\/@mattrglobal\/node-bbs-signatures\/native\/index\.node$/;
  for (const warning of trace.warnings) {
    const dependency = /^Failed to resolve dependency "([^"]+)":/.exec(warning.message)?.[1];
    if (!dependency || !optionalDependency.test(dependency.replaceAll("\\", "/"))) throw warning;
  }
  // security-context reads these through a helper that NFT cannot evaluate.
  for (const name of ["security-v1", "security-v2"]) {
    trace.fileList.add(path.relative(root, require.resolve(`security-context/contexts/${name}.jsonld`)));
  }
  return [...trace.fileList].sort().map((file) => file.replaceAll("\\", "/"));
}

module.exports = { runtimeModules, traceCredentialRuntime };
