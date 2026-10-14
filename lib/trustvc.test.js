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

  await t.test("prepared distinct DID method verifies against the preserved candidate document", async () => {
    const { prepareDIDKeyMaterial } = require("../scripts/generate-did-keys");
    const document = JSON.parse(readFileSync(
      `${__dirname}/../public/.well-known/did.json`, "utf8"
    ));
    const { candidate, environment } = await prepareDIDKeyMaterial({
      document, keyId: `${controller}#ecdsa-test`,
    });
    const preparedEnv = require("dotenv").parse(environment);
    Object.assign(process.env, preparedEnv);
    try {
      const method = candidate.verificationMethod.at(-1);
      const publicLoader = await getDocumentLoader({
        [controller]: candidate,
        [method.id]: method,
      });
      const result = await signDocumentWithDID(buildVCPayload(data, "opencerts"));
      assert.equal(result.signed, true, result.error);
      assert.equal(result.credential.proof.verificationMethod, method.id);
      const disclosure = await deriveCredential(result.credential, ["/credentialSubject"],
        { documentLoader: publicLoader });
      assert.ok(disclosure.derived, disclosure.error);
      const verification = await verifyW3C(disclosure.derived, { documentLoader: publicLoader });
      assert.equal(verification.verified, true, verification.error);

      const withStatus = await verifyCredential(result.credential, { documentLoader: publicLoader });
      assert.equal(withStatus.valid, false);
      assert.equal(withStatus.details.signatureVerification, "verified");
      assert.equal(withStatus.details.credentialStatus, "unsupported");
      const changedStatus = structuredClone(result.credential);
      changedStatus.credentialStatus[0].targetHash = `0x${"ff".repeat(32)}`;
      const changedStatusResult = await verifyCredential(changedStatus, { documentLoader: publicLoader });
      assert.equal(changedStatusResult.valid, false);
      assert.notEqual(changedStatusResult.details?.signatureVerification, "verified");

      const unsigned = buildVCPayload(data, "opencerts");
      delete unsigned.credentialStatus;
      const withoutStatus = await signDocumentWithDID(unsigned);
      assert.equal(withoutStatus.signed, true, withoutStatus.error);
      const before = JSON.stringify(withoutStatus.credential);
      const application = await verifyCredential(withoutStatus.credential, { documentLoader: publicLoader });
      assert.equal(application.valid, true, application.message);
      assert.equal(application.details.verificationMethod, method.id);
      assert.equal(JSON.stringify(withoutStatus.credential), before);

      const derivedWithoutStatus = await deriveCredential(withoutStatus.credential,
        ["/credentialSubject"], { documentLoader: publicLoader });
      assert.ok(derivedWithoutStatus.derived, derivedWithoutStatus.error);
      const derivedResult = await verifyCredential(derivedWithoutStatus.derived,
        { documentLoader: publicLoader });
      assert.equal(derivedResult.valid, true, derivedResult.message);

      const tampered = structuredClone(withoutStatus.credential);
      tampered.credentialSubject.name = "Tampered recipient";
      assert.equal((await verifyCredential(tampered, { documentLoader: publicLoader })).valid, false);
      const changedIssuer = structuredClone(withoutStatus.credential);
      changedIssuer.issuer = "did:web:other.example";
      assert.equal((await verifyCredential(changedIssuer, { documentLoader: publicLoader })).valid, false);
      const unknownMethod = structuredClone(withoutStatus.credential);
      unknownMethod.proof.verificationMethod = `${controller}#unpublished`;
      const unknownResult = await verifyCredential(unknownMethod, { documentLoader: publicLoader });
      assert.equal(unknownResult.valid, false);
      assert.match(unknownResult.message, /not authorized/);

      const unauthorized = structuredClone(candidate);
      unauthorized.assertionMethod = unauthorized.assertionMethod.filter((entry) => entry !== method.id);
      const unauthorizedLoader = await getDocumentLoader({ [controller]: unauthorized, [method.id]: method });
      const unauthorizedResult = await verifyCredential(withoutStatus.credential,
        { documentLoader: unauthorizedLoader });
      assert.equal(unauthorizedResult.valid, false);
      assert.match(unauthorizedResult.message, /not authorized/);

      const unresolved = await verifyCredential(withoutStatus.credential, {
        documentLoader: async () => { throw new Error("network DID resolution failure"); },
      });
      assert.equal(unresolved.valid, false);
      assert.match(unresolved.message, /Could not resolve DID/);

      for (const [field, value] of [
        ["validUntil", "2000-01-01T00:00:00Z"],
        ["validFrom", "2999-01-01T00:00:00Z"],
      ]) {
        const outsideValidity = await signDocumentWithDID({ ...unsigned, [field]: value });
        assert.equal(outsideValidity.signed, true, outsideValidity.error);
        const invalid = await verifyCredential(outsideValidity.credential,
          { documentLoader: publicLoader });
        assert.equal(invalid.valid, false);
      }
    } finally {
      Object.assign(process.env, testEnv);
    }
  });

  await t.test("opt-in signed status lists enforce revoke, suspend, reinstate and freshness", async () => {
    const { createBitstringEntries, createStatusListDocument } = await import("./bitstring-status.ts");
    const makeLoader = async (revocation, suspension) => getDocumentLoader({
      [controller]: didDocument, [id]: publicKey,
      [revocation.id]: revocation, [suspension.id]: suspension,
    });
    const entries = createBitstringEntries("https://verifiable.sg", 131073);
    assert.equal(entries[0].statusListIndex, "1");
    assert.match(entries[0].statusListCredential, /\/1\/revocation$/);
    const payload = {
      ...buildVCPayload({ ...data, validFrom: "2000-01-01T00:00:00Z" }, "opencerts"),
      credentialStatus: entries,
    };
    const issued = await signDocumentWithDID(payload);
    assert.equal(issued.signed, true, issued.error);
    assert.equal("targetHash" in issued.credential.credentialStatus[0], false);
    const viewed = mapVcToCertEntry(JSON.parse(JSON.stringify(issued.credential)));
    const html = renderToStaticMarkup(createElement(CertificateTemplateRenderer, { certificate: viewed }));
    assert.ok(html.includes(data.recipientName));
    assert.ok(html.includes(data.certificateType));
    const signList = async (purpose, status, now) => {
      const entry = entries.find((item) => item.statusPurpose === purpose);
      const raw = await createStatusListDocument(entry.statusListCredential, controller,
        purpose, [{ index: 1, status }], now);
      const result = await signDocumentWithDID(raw);
      assert.equal(result.signed, true, result.error);
      return result.credential;
    };
    for (const [state, valid, expected] of [
      ["issued", true, "verified"], ["suspended", false, "suspended"],
      ["issued", true, "verified"], ["revoked", false, "revoked"],
    ]) {
      const revocation = await signList("revocation", state);
      const suspension = await signList("suspension", state);
      const loader = await makeLoader(revocation, suspension);
      const result = await verifyCredential(issued.credential, { documentLoader: loader });
      assert.equal(result.valid, valid, result.message);
      assert.equal(result.details.credentialStatus, expected);
    }
    const current = await signList("revocation", "issued");
    const suspended = await signList("suspension", "issued");
    const availableLoader = await makeLoader(current, suspended);
    assert.equal((await verifyCredential(issued.credential, {
      documentLoader: async (url) => {
        if (url.includes("/api/status-list/")) throw new Error("test status list unavailable");
        return availableLoader(url);
      },
    })).valid, false, "unavailable status lists must not be treated as active");
    const { gunzipSync, gzipSync } = require("node:zlib");
    assert.match(current.credentialSubject.encodedList, /^u[A-Za-z0-9_-]+$/);
    const bytes = gunzipSync(Buffer.from(current.credentialSubject.encodedList.slice(1), "base64url"));
    assert.equal(bytes.length, 16384);
    assert.equal(bytes[0], 0xbf, "index 1 is the second most-significant bit, with other indices fail-closed");
    const stale = await signList("revocation", "issued", new Date(Date.now() - 120000));
    assert.equal((await verifyCredential(issued.credential, {
      documentLoader: await makeLoader(stale, suspended),
    })).valid, false);
    const tampered = structuredClone(current);
    tampered.credentialSubject.encodedList = suspended.credentialSubject.encodedList + "a";
    assert.equal((await verifyCredential(issued.credential, {
      documentLoader: await makeLoader(tampered, suspended),
    })).valid, false);
    const unallocated = createBitstringEntries("https://verifiable.sg", 131074);
    const notPersisted = await signDocumentWithDID({ ...payload, credentialStatus: unallocated });
    const inactive = await verifyCredential(notPersisted.credential, {
      documentLoader: await makeLoader(current, suspended),
    });
    assert.equal(inactive.valid, false);
    assert.equal(inactive.details.credentialStatus, "revoked");
    const badURL = structuredClone(payload);
    badURL.credentialStatus[0].statusListCredential = "https://other.example/status";
    const foreign = await signDocumentWithDID(badURL);
    assert.equal((await verifyCredential(foreign.credential, {
      documentLoader: await makeLoader(current, suspended),
    })).valid, false);
    const changedMethod = structuredClone(issued.credential);
    changedMethod.issuingMethods = ["ethereum"];
    assert.equal((await verifyCredential(changedMethod, {
      documentLoader: await makeLoader(current, suspended),
    })).valid, false, "changing signed top-level fields must not be hidden by derivation");
    const mixed = await signDocumentWithDID({ ...payload, issuingMethods: ["did", "ethereum"] });
    assert.equal((await verifyCredential(mixed.credential, {
      documentLoader: await makeLoader(current, suspended),
    })).valid, false, "status validation cannot bypass Ethereum checks");
    const future = await signList("revocation", "issued", new Date(Date.now() + 120000));
    assert.equal((await verifyCredential(issued.credential, {
      documentLoader: await makeLoader(future, suspended),
    })).valid, false);
    const rawList = await createStatusListDocument(entries[0].statusListCredential, controller,
      "revocation", [{ index: 1, status: "issued" }]);
    for (const subjectPatch of [
      { id: "https://other.example/#list" }, { ttl: 120000 },
      { encodedList: current.credentialSubject.encodedList.slice(1) },
      { encodedList: `u${gzipSync(Buffer.alloc(16385)).toString("base64url")}` },
      { encodedList: `u${gzipSync(Buffer.alloc(16383)).toString("base64url")}` },
    ]) {
      const bad = await signDocumentWithDID({ ...rawList,
        credentialSubject: { ...rawList.credentialSubject, ...subjectPatch } });
      assert.equal(bad.signed, true, bad.error);
      assert.equal((await verifyCredential(issued.credential, {
        documentLoader: await makeLoader(bad.credential, suspended),
      })).valid, false);
    }
    for (const patch of [
      { statusListIndex: "131072" }, { statusListIndex: "-1" }, { statusSize: 2 },
      { statusListCredential: "https://verifiable.sg/api/status-list/2147483648/revocation" },
    ]) {
      const invalid = structuredClone(payload);
      Object.assign(invalid.credentialStatus[0], patch);
      const bad = await signDocumentWithDID(invalid);
      assert.equal(bad.signed, true, bad.error);
      assert.equal((await verifyCredential(bad.credential, {
        documentLoader: await makeLoader(current, suspended),
      })).valid, false);
    }
  });
});
