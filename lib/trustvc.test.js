const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { registerHooks } = require("node:module");
const { fileURLToPath } = require("node:url");
const ts = require("typescript");
const jsonld = require("jsonld");
const { getDocumentLoader } = require("@trustvc/w3c-context");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(candidate)) return nextResolve(candidate.href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".ts")) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText;
      return { format: "module", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

test("certificate formats process protected JSON-LD contexts and sign successfully", async (t) => {
  const { generate } = await import("@digitalbazaar/ecdsa-multikey");
  const controller = "did:web:verifiable.sg";
  const id = `${controller}#key-1`;
  const key = await generate({ curve: "P-256", controller, id });
  const exported = await key.export({ publicKey: true, secretKey: true });
  const testEnv = {
    DID_KEY_ID: id,
    DID_CONTROLLER: controller,
    DID_PUBLIC_KEY_MULTIBASE: exported.publicKeyMultibase,
    DID_PRIVATE_KEY_MULTIBASE: exported.secretKeyMultibase,
  };
  const previousEnv = Object.fromEntries(
    Object.keys(testEnv).map((name) => [name, process.env[name]])
  );
  t.after(() => {
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  Object.assign(process.env, testEnv);

  const { buildVCPayload, signDocumentWithDID } = await import("./trustvc.ts");
  const { OPENCERTS_CONTEXT } = await import("./constants.ts");
  const documentLoader = await getDocumentLoader();
  const data = {
    id: "test-jsonld-context",
    recipientName: "Alice Tan",
    recipientEmail: "alice@example.com",
    certificateType: "ProfessionalCertificate",
    templateId: "classic",
    issuerName: "Test Issuer",
    issueDate: "2026-10-14",
    description: "Protected context regression",
    validFrom: "2026-10-14T00:00:00Z",
    validUntil: "2027-10-14T23:59:59Z",
    issuingMethods: ["did"],
  };

  for (const mode of ["standard", "v1", "opencerts", "w3c"]) {
    await t.test(mode, async () => {
      const payload = buildVCPayload(data, mode);
      const expanded = await jsonld.expand(payload, { documentLoader, safe: true });
      assert.equal(expanded.length, 1);
      assert.equal(payload.type.includes("OpenAttestationDocument2018"),
        mode === "opencerts" || mode === "w3c");

      const expandedType = await jsonld.expand({
        "@context": payload["@context"],
        type: "OpenCertsCertificate",
      }, { documentLoader, safe: true });
      assert.deepEqual(expandedType[0]["@type"], [
        OPENCERTS_CONTEXT["@context"].OpenCertsCertificate["@id"],
      ]);

      const result = await signDocumentWithDID(payload);
      assert.equal(result.signed, true, result.error);
      assert.equal(result.credential.proof.type, "DataIntegrityProof");
      assert.equal(result.credential.proof.cryptosuite, "ecdsa-sd-2023");
      assert.equal(result.credential.proof.verificationMethod, id);
    });
  }
});
