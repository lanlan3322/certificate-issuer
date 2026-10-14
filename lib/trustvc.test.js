const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { registerHooks } = require("node:module");
const { fileURLToPath } = require("node:url");
const ts = require("typescript");
const jsonld = require("jsonld");
const { getDocumentLoader } = require("@trustvc/w3c-context");
const { isAddress, isHexString, keccak256, toUtf8Bytes, Wallet } = require("ethers");
const { deriveCredential, verifyCredential: verifyW3C } = require("@trustvc/w3c-vc");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && /\.tsx?$/.test(context.parentURL ?? "")) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(`${specifier}${extension}`, context.parentURL);
        if (existsSync(candidate)) return nextResolve(candidate.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && /\.tsx?$/.test(url)) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        fileName: fileURLToPath(url),
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
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

  const {
    buildVCPayload,
    issueDIDCertificate,
    signDocumentWithDID,
    signCredentialWithEthereum,
    verifyCredential,
  } = await import("./trustvc.ts");
  const { mapVcToCertEntry } = await import("./credential-mapper.ts");
  const { default: CertificateTemplateRenderer } = await import("../app/templates/CertificateTemplateRenderer.tsx");
  const { OPENCERTS_CONTEXT, DOCUMENT_STORE_CONFIG } = await import("./constants.ts");
  const publicKey = await key.export({ publicKey: true });
  const didDocument = {
    "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"],
    id: controller,
    verificationMethod: [publicKey],
    assertionMethod: [id],
  };
  const documentLoader = await getDocumentLoader({
    [controller]: didDocument,
    [id]: publicKey,
  });
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
      assert.equal(payload.credentialStatus[0].id,
        `did:ethr:${DOCUMENT_STORE_CONFIG.address}#${data.id}`);
      assert.equal(isAddress(payload.credentialStatus[0].id.split("#")[0].slice("did:ethr:".length)), true);

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
      const serialized = JSON.parse(JSON.stringify(result.credential));
      const viewed = mapVcToCertEntry(serialized);
      assert.equal(viewed.recipientName, data.recipientName);
      assert.equal(viewed.certificateType, data.certificateType);
      assert.equal(viewed.templateId, data.templateId);
      for (const templateId of ["classic", "modern", "minimal", "fta"]) {
        const html = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
          certificate: { ...viewed, templateId },
        }));
        assert.ok(html.includes(data.recipientName));
        assert.ok(html.includes(data.certificateType));
      }
      const disclosure = await deriveCredential(result.credential, ["/credentialSubject"], { documentLoader });
      assert.ok(disclosure.derived, disclosure.error);
      const verification = await verifyW3C(disclosure.derived, { documentLoader });
      assert.equal(verification.verified, true, verification.error);
      assert.equal(isHexString(result.credential.credentialStatus[0].targetHash, 32), true);
      assert.equal("targetHash" in payload.credentialStatus[0], false,
        "signing must not mutate the caller's unsigned payload");
      const { proof: _proof, ...commitmentInput } = serialized;
      delete commitmentInput.credentialStatus[0].targetHash;
      const canonical = JSON.stringify(commitmentInput, (_name, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(Object.keys(value).sort().map((name) => [name, value[name]]))
          : value);
      assert.equal(result.credential.credentialStatus[0].targetHash, keccak256(toUtf8Bytes(canonical)));

      const tampered = structuredClone(result.credential);
      tampered.credentialStatus[0].targetHash = `0x${"00".repeat(32)}`;
      const tamperedDisclosure = await deriveCredential(tampered, ["/credentialSubject"], { documentLoader });
      if (tamperedDisclosure.derived) {
        const tamperedResult = await verifyW3C(tamperedDisclosure.derived, { documentLoader });
        assert.equal(tamperedResult.verified, false, "targetHash must be protected by the signature");
      } else {
        assert.ok(tamperedDisclosure.error);
      }
    });
  }

  await t.test("legacy DID issuance entry point returns a verifiable disclosure", async () => {
    const result = await issueDIDCertificate(data);
    assert.equal(result.signed, true, result.error);
    const disclosure = await deriveCredential(result.credential, ["/credentialSubject"], { documentLoader });
    assert.ok(disclosure.derived, disclosure.error);
    const verification = await verifyW3C(disclosure.derived, { documentLoader });
    assert.equal(verification.verified, true, verification.error);
  });

  await t.test("existing wallet signature verification and viewing remain supported", async () => {
    const wallet = Wallet.createRandom();
    const result = await signCredentialWithEthereum(buildVCPayload(data), wallet);
    const legacy = JSON.parse(JSON.stringify(result.credential));
    const verification = await verifyCredential(legacy);
    assert.equal(verification.valid, true, verification.message);
    assert.equal(mapVcToCertEntry(legacy).recipientName, data.recipientName);
    legacy.credentialSubject.name = "Modified recipient";
    assert.equal((await verifyCredential(legacy)).valid, false);
  });
});
