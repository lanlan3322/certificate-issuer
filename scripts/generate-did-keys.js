const { mkdir, readFile, realpath, writeFile } = require("node:fs/promises");
const path = require("node:path");

async function prepareDIDKeyMaterial({ document, keyId, jwksDocument }) {
  const existingJWKS = jwksDocument ?? JSON.parse(await readFile(
    path.join(__dirname, "../public/.well-known/jwks.json"), "utf8"
  ));
  const controller = document.id;
  if (typeof controller !== "string" || !/^did:web:[^\s#=?/]+$/.test(controller)) {
    throw new Error("The existing document must have a did:web controller.");
  }
  if (typeof keyId !== "string" || !keyId.startsWith(`${controller}#`) ||
      !/^[A-Za-z0-9._-]+$/.test(keyId.slice(controller.length + 1))) {
    throw new Error("Provide a distinct full key ID with a simple nonempty fragment.");
  }
  const kid = keyId.slice(controller.length + 1);
  if (!Array.isArray(existingJWKS.keys)) {
    throw new Error("Existing JWKS keys must be an array; review it before migration.");
  }
  if (existingJWKS.keys.some((entry) => entry?.kid === kid || entry?.kid === keyId)) {
    throw new Error("The key ID already exists in JWKS. Never replace historical key material.");
  }
  for (const name of ["verificationMethod", "authentication", "assertionMethod",
    "keyAgreement", "capabilityInvocation", "capabilityDelegation"]) {
    const entries = document[name] ?? [];
    if (!Array.isArray(entries)) {
      throw new Error(`Existing ${name} must be an array; review it before migration.`);
    }
    if (entries.some((entry) => entry === keyId || entry?.id === keyId)) {
      throw new Error("The key ID already exists. Never replace historical key material.");
    }
  }
  const contexts = document["@context"];
  if (!Array.isArray(contexts)) {
    throw new Error("Existing @context must be an array; review it before migration.");
  }
  const { generate, toJwk } = await import("@digitalbazaar/ecdsa-multikey");
  const key = await generate({ curve: "P-256", controller, id: keyId });
  const publicMethod = await key.export({ publicKey: true });
  const exported = await key.export({ publicKey: true, secretKey: true });
  const publicJWK = await toJwk({ keyPair: key });
  const jwksCandidate = {
    ...structuredClone(existingJWKS),
    keys: [...structuredClone(existingJWKS.keys), {
      kty: publicJWK.kty,
      crv: publicJWK.crv,
      kid,
      use: "sig",
      x: publicJWK.x,
      y: publicJWK.y,
    }],
  };
  const multikeyContext = "https://w3id.org/security/multikey/v1";
  const candidate = {
    ...structuredClone(document),
    "@context": contexts.includes(multikeyContext) ? [...contexts] : [...contexts, multikeyContext],
    verificationMethod: [...(document.verificationMethod ?? []), publicMethod],
    assertionMethod: [...(document.assertionMethod ?? []), keyId],
  };
  const environment = [
    `DID_CONTROLLER=${JSON.stringify(controller)}`,
    `DID_KEY_ID=${JSON.stringify(keyId)}`,
    `DID_PUBLIC_KEY_MULTIBASE=${JSON.stringify(exported.publicKeyMultibase)}`,
    `DID_PRIVATE_KEY_MULTIBASE=${JSON.stringify(exported.secretKeyMultibase)}`,
    "",
  ].join("\n");
  return { candidate, jwksCandidate, environment };
}

async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!["--output-dir", "--key-id", "--did-document", "--jwks-document"].includes(name) ||
        !args[index + 1] || args[index + 1].startsWith("--") || options[name]) {
      throw new Error("Usage: node scripts/generate-did-keys.js --output-dir <new-private-directory> --key-id <distinct-did#fragment> [--did-document <existing-public-did.json> --jwks-document <existing-public-jwks.json>]");
    }
    options[name] = args[index + 1];
  }
  if (!options["--output-dir"] || !options["--key-id"]) {
    throw new Error("--output-dir and --key-id are required. No files were written.");
  }
  if (Boolean(options["--did-document"]) !== Boolean(options["--jwks-document"])) {
    throw new Error("Provide both --did-document and --jwks-document to preserve the same publication baseline.");
  }
  const directory = path.resolve(options["--output-dir"]);
  const parent = await realpath(path.dirname(directory));
  const repository = await realpath(path.join(__dirname, ".."));
  const relative = path.relative(repository, parent);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("Choose an output directory outside the repository to protect signing secrets.");
  }
  const documentPath = options["--did-document"] ??
    path.join(__dirname, "../public/.well-known/did.json");
  const document = JSON.parse(await readFile(documentPath, "utf8"));
  const jwksPath = options["--jwks-document"] ??
    path.join(__dirname, "../public/.well-known/jwks.json");
  const jwksDocument = JSON.parse(await readFile(jwksPath, "utf8"));
  const { candidate, jwksCandidate, environment } = await prepareDIDKeyMaterial({
    document, jwksDocument, keyId: options["--key-id"],
  });
  await mkdir(directory, { mode: 0o700 });
  await writeFile(path.join(directory, "signing.env"), environment, { mode: 0o600, flag: "wx" });
  await writeFile(path.join(directory, "did.candidate.json"),
    `${JSON.stringify(candidate, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await writeFile(path.join(directory, "jwks.candidate.json"),
    `${JSON.stringify(jwksCandidate, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  console.log("Prepared signing.env, did.candidate.json and jwks.candidate.json in the requested private directory.");
  console.log("No existing keys, environment files or published DID documents were changed.");
}

module.exports = { prepareDIDKeyMaterial, main };

if (require.main === module) {
  main().catch((error) => {
    console.error(`DID key preparation failed: ${error.code ?? error.message}`);
    process.exitCode = 1;
  });
}
