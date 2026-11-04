const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { registerHooks } = require("node:module");
const { fileURLToPath } = require("node:url");
const ts = require("typescript");
const jsonld = require("jsonld");
const { getDocumentLoader } = require("@trustvc/w3c-context");
const { isAddress, isHexString, keccak256, toUtf8Bytes, Wallet, JsonRpcProvider, Interface } = require("ethers");
const { deriveCredential, verifyCredential: verifyW3C } = require("@trustvc/w3c-vc");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function storeProvider({ issued = true, revoked = false, fail = false, chainId = 11155111 } = {}) {
  const provider = new JsonRpcProvider(undefined, chainId, { staticNetwork: true });
  const abi = new Interface(["function isIssued(bytes32) view returns(bool)",
    "function isRevoked(bytes32) view returns(bool)"]);
  const calls = [];
  provider._perform = async (request) => {
    assert.equal(request.method, "call");
    if (fail) throw new Error("test RPC unavailable");
    const parsed = abi.parseTransaction({ data: request.transaction.data });
    calls.push({ method: parsed.name, hash: parsed.args[0], address: request.transaction.to });
    return abi.encodeFunctionResult(parsed.name, [parsed.name === "isIssued" ? issued : revoked]);
  };
  return { provider, calls };
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/image") return nextResolve("next/image.js", context);
    if (specifier.startsWith(".") && /\.tsx?$/.test(context.parentURL ?? "")) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(`${specifier}${extension}`, context.parentURL);
        if (existsSync(candidate)) return nextResolve(candidate.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/next/image.js")) {
      return {
        format: "module",
        source: 'import image from "./dist/shared/lib/image-external.js"; export default image.default;',
        shortCircuit: true,
      };
    }
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

test("FTA course hours survive credential generation and both preview mappings", async () => {
  const { buildVCPayload } = await import("./trustvc.ts");
  const { mapVcToCertEntry } = await import("./credential-mapper.ts");
  const { toCertificateTemplateData } = await import("../app/renderer/certificateView.ts");
  const data = {
    id: "fta-course-hours",
    recipientName: "Test Recipient",
    recipientEmail: "recipient@example.com",
    certificateType: "ProfessionalCertificate",
    templateId: "fta",
    issuerName: "Fintech Academy",
    issueDate: "2026-11-04",
    validFrom: "2026-11-04T00:00:00Z",
    description: "Generative Artificial Intelligence",
    courseLength: 8,
  };
  const payload = JSON.parse(JSON.stringify(buildVCPayload(data)));
  assert.equal(payload.credentialSubject.courseLength, 8);

  const galleryView = mapVcToCertEntry(payload);
  const rendererView = toCertificateTemplateData(payload, "");
  assert.equal(galleryView.courseLength, 8);
  assert.equal(rendererView.courseLength, 8);

  const { default: FTATemplate } = await import("../app/templates/FTATemplate.tsx");
  for (const certificate of [galleryView, rendererView]) {
    const html = renderToStaticMarkup(createElement(FTATemplate, { certificate }));
    assert.match(html, /\(8 hours\)/);
  }

  for (const value of [0, 7.5, "8"]) {
    const expected = Number(value);
    for (const document of [
      { ...data, courseLength: value },
      { credentialSubject: { ...payload.credentialSubject, courseLength: value } },
    ]) {
      assert.equal(mapVcToCertEntry(document).courseLength, expected);
    }
    assert.equal(toCertificateTemplateData({
      credentialSubject: { ...payload.credentialSubject, courseLength: value },
    }, "").courseLength, expected);
  }

  assert.equal(mapVcToCertEntry({
    recipient_name: "Test Recipient",
    certificate_type: "Certificate of Completion",
    courseLength: 8,
  }).courseLength, 8);
  const withoutHours = buildVCPayload({ ...data, courseLength: undefined });
  assert.equal("courseLength" in withoutHours.credentialSubject, false);
  assert.equal(mapVcToCertEntry(withoutHours).courseLength, undefined);
  const html = renderToStaticMarkup(createElement(FTATemplate, {
    certificate: toCertificateTemplateData(withoutHours, ""),
  }));
  assert.doesNotMatch(html, /hours\)/);

  const documentLoader = await getDocumentLoader();
  const [expanded] = await jsonld.expand(payload, { documentLoader, safe: true });
  const [subject] = expanded["https://www.w3.org/2018/credentials#credentialSubject"];
  assert.equal(subject["https://verifiable.sg/credentials#courseLength"][0]["@value"], 8);
});

test("all certificate templates share an A4 sheet and retain verification details", async () => {
  const { default: CertificateTemplateRenderer } = await import("../app/templates/CertificateTemplateRenderer.tsx");
  const verificationUrl = "https://example.com/verify/?id=certificate-123";
  const certificate = {
    id: "certificate-123",
    recipientName: "Test Recipient",
    recipientEmail: "recipient@example.com",
    certificateType: "Professional Certificate",
    issuerName: "Test Academy",
    issueDate: "2026-11-04",
    validFrom: "2026-11-04T00:00:00Z",
    description: "Test course",
    verificationUrl,
    courseLength: 8,
  };
  for (const templateId of ["classic", "modern", "minimal", "fta"]) {
    const html = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
      certificate: { ...certificate, templateId },
      verificationFooterUrl: verificationUrl,
    }));
    assert.equal((html.match(/\bcertificate-a4-paper\b/g) ?? []).length, 1, templateId);
    assert.equal((html.match(/\bcertificate-main\b/g) ?? []).length, 1, templateId);
    assert.match(html, /certificate-a4-viewport[^"]*max-w-\[210mm\]/, templateId);
    assert.match(html, /certificate-a4-paper[^"]*w-\[210mm\][^"]*min-h-\[297mm\]/, templateId);
    assert.match(html, templateId === "fta"
      ? /grid-rows-\[minmax\(min-content,0\.8fr\)_auto_minmax\(min-content,1\.2fr\)\]/
      : /grid-rows-\[minmax\(min-content,1fr\)_auto_minmax\(min-content,1fr\)\]/, templateId);
    assert.match(html, /Test Recipient/, templateId);
    assert.match(html, /Test course/, templateId);
    assert.equal((html.match(/Certificate verification QR code/g) ?? []).length, 1, templateId);
    assert.match(html, /Scan to verify/, templateId);
    if (templateId === "fta") {
      assert.match(html, /\(8 hours\)/);
      assert.match(html, /Dr\. Lillian Koh/);
      assert.doesNotMatch(html, /Digital signature and verification/);
    } else {
      assert.match(html, /Digital signature and verification/);
      assert.match(html, /certificate-123/);
      assert.match(html, /https:\/\/example\.com\/verify\/\?id=certificate-123/);
    }
  }
});

test("FTA body uses the reference spacing without losing optional details", async () => {
  const { default: FTATemplate } = await import("../app/templates/FTATemplate.tsx");
  const certificate = {
    recipientName: "Tan Tat Teck Francis",
    description: "Generative Artificial Intelligence for Banking and Financial Services",
    certificateNo: "TGS-2026064560",
    courseLength: 8,
    issueDate: "2026-07-08",
    verificationUrl: "https://example.com/verify/fta",
  };
  const html = renderToStaticMarkup(createElement(FTATemplate, { certificate }));
  assert.match(html, /grid-rows-\[minmax\(min-content,0\.8fr\)_auto_minmax\(min-content,1\.2fr\)\]/);
  assert.match(html, /certificate-main flex min-w-0 flex-col items-center/);
  assert.match(html, /mt-0\.5 max-w-full break-words font-bold italic leading-tight text-4xl/);
  assert.match(html, /mt-4 text-2xl italic text-\[#4a4a4a\]/);
  assert.match(html, /mt-2 max-w-2xl break-words font-bold leading-\[1\.17\] text-3xl/);
  assert.match(html, /mt-1\.5 text-xl[^>]*>\(8 hours\)/);
  assert.match(html, /mt-0\.5 text-xl[^>]*>Accredited by IBF/);
  assert.match(html, /mt-5 max-w-full break-all font-semibold text-base/);
  assert.match(html, /mt-2 text-base[^>]*>8 July 2026/);
  assert.match(html, /Certificate verification QR code/);
  assert.match(html, /Dr\. Lillian Koh/);

  const withoutOptionalDetails = renderToStaticMarkup(createElement(FTATemplate, {
    certificate: { ...certificate, courseLength: undefined, certificateNo: undefined },
  }));
  assert.doesNotMatch(withoutOptionalDetails, /hours\)|TGS-2026064560/);
  assert.match(withoutOptionalDetails, /Accredited by IBF/);
});

test("certificate text density changes at the combined-length thresholds", async () => {
  const { getCertificateTextDensity } = await import("../app/templates/text-density.ts");
  for (const [length, expected] of [
    [240, [false, false, false, false]],
    [241, [true, false, false, false]],
    [400, [true, false, false, false]],
    [401, [true, true, false, false]],
    [700, [true, true, false, false]],
    [701, [true, true, true, false]],
    [1000, [true, true, true, false]],
    [1001, [true, true, true, true]],
  ]) {
    const density = getCertificateTextDensity("A".repeat(length - 1), "B", undefined);
    assert.deepEqual(
      [density.compact, density.dense, density.veryDense, density.extremelyDense],
      expected,
      `combined length ${length}`
    );
  }
});

test("non-FTA templates wrap and preserve long certificate text", async () => {
  const { default: CertificateTemplateRenderer } = await import("../app/templates/CertificateTemplateRenderer.tsx");
  const name = "N".repeat(512);
  const description = "D".repeat(512);
  for (const templateId of ["classic", "modern", "minimal"]) {
    const html = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
      certificate: {
        id: "certificate-123",
        recipientName: name,
        recipientEmail: "recipient@example.com",
        certificateType: "Professional Certificate",
        issuerName: "Test Academy",
        issueDate: "2026-11-04",
        validFrom: "2026-11-04T00:00:00Z",
        description,
        templateId,
      },
    }));
    assert.ok(html.includes(name), templateId);
    assert.ok(html.includes(description), templateId);
    assert.match(html, /break-words/, templateId);
    assert.match(html, /text-xs/, templateId);
  }
});

test("FTA verification QR encodes the certificate URL when available", async () => {
  const { QRCodeSVG } = await import("qrcode.react");
  const { default: CertificateTemplateRenderer } = await import("../app/templates/CertificateTemplateRenderer.tsx");
  const { buildVerificationUrl } = await import("./site.ts");
  const verificationUrl = buildVerificationUrl("https://example.com", "urn:uuid:fta-test");
  const certificate = {
    recipientName: "Test Recipient",
    recipientEmail: "recipient@example.com",
    certificateType: "ProfessionalCertificate",
    templateId: "fta",
    issuerName: "Fintech Academy",
    issueDate: "2026-11-04",
    validFrom: "2026-11-04T00:00:00Z",
    description: "Test course",
    verificationUrl,
  };
  const html = renderToStaticMarkup(createElement(CertificateTemplateRenderer, { certificate }));
  const qr = html.match(/<svg[^>]*aria-label="Certificate verification QR code"[\s\S]*?<\/svg>/);
  assert.ok(qr, "FTA certificate should render a labelled verification QR code");
  assert.match(html, /Scan to verify/);
  const expectedQr = renderToStaticMarkup(createElement(QRCodeSVG, {
    value: verificationUrl,
    size: 128,
    level: "M",
    includeMargin: true,
  }));
  const paths = (svg) => [...svg.matchAll(/<path[^>]* d="([^"]+)"/g)].map((match) => match[1]);
  const expectedPaths = paths(expectedQr);
  assert.equal(expectedPaths.length, 2, "QR output should contain background and data paths");
  assert.deepEqual(paths(qr[0]), expectedPaths);

  const withoutUrl = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
    certificate: { ...certificate, verificationUrl: undefined },
  }));
  assert.doesNotMatch(withoutUrl, /Certificate verification QR code|Scan to verify/);
  assert.match(withoutUrl, /Dr\. Lillian Koh/);
});

test("FTA keeps long certificate text intact and reduces its A4 layout density", async () => {
  const { default: CertificateTemplateRenderer } = await import("../app/templates/CertificateTemplateRenderer.tsx");
  const certificate = {
    recipientName: "Recipient",
    recipientEmail: "recipient@example.com",
    certificateType: "ProfessionalCertificate",
    templateId: "fta",
    issuerName: "Fintech Academy",
    issueDate: "2026-11-04",
    validFrom: "2026-11-04T00:00:00Z",
    description: "Course",
  };
  for (const [name, description, expectedSize] of [
    ["Recipient", "Course", "text-3xl"],
    ["Recipient", "A".repeat(300), "text-xl"],
    ["Recipient", "B".repeat(500), "text-base"],
    ["C".repeat(512), "D".repeat(512), "text-[10px]"],
  ]) {
    const html = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
      certificate: { ...certificate, recipientName: name, description },
    }));
    assert.match(html, /certificate-a4-paper[^"]*w-\[210mm\][^"]*min-h-\[297mm\][^"]*fta-certificate-paper/);
    assert.ok(html.includes(name));
    assert.ok(html.includes(description));
    assert.ok(html.includes(`${expectedSize}">${description}</p>`));
  }
  const certificateNo = "TGS".repeat(170) + "00";
  const numbered = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
    certificate: { ...certificate, certificateNo },
  }));
  assert.ok(numbered.includes(certificateNo));
  assert.match(numbered, /max-w-full break-all/);
  assert.ok(numbered.includes(`text-base">${certificate.description}</p>`));
});

test("FTA signature uses the configured deployment base path", async () => {
  const { default: FTATemplate } = await import("../app/templates/FTATemplate.tsx");
  const previous = process.env.NEXT_PUBLIC_BASE_PATH;
  try {
    process.env.NEXT_PUBLIC_BASE_PATH = "/certificate-issuer";
    const html = renderToStaticMarkup(createElement(FTATemplate, {
      certificate: {
        recipientName: "Recipient",
        recipientEmail: "recipient@example.com",
        certificateType: "ProfessionalCertificate",
        issuerName: "Fintech Academy",
        issueDate: "2026-11-04",
        validFrom: "2026-11-04T00:00:00Z",
        description: "Course",
      },
    }));
    assert.match(html, /certificate-issuer(?:%2F|\/)fta-signature\.png/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
    else process.env.NEXT_PUBLIC_BASE_PATH = previous;
  }
});

test("verification context URLs load through the TrustVC server module loader", async () => {
  const { getTrustVCContextUrls } = await import("./trustvc.ts");
  const urls = await getTrustVCContextUrls();

  assert.equal(urls.has("https://www.w3.org/ns/credentials/v2"), true);
  assert.equal(urls.has("https://w3id.org/security/data-integrity/v2"), true);
});

test("Document Store references accept only explicit supported networks and valid contract addresses", async () => {
  const { getCredentialDocumentStore, buildVCPayload } = await import("./trustvc.ts");
  const address = "0x814D9c222D3b5A8282e0467Fa12b24C057731dD6";
  const make = (id) => ({ credentialStatus: [{ type: "OpenAttestationDocumentStore", id }] });
  for (const [prefix, network] of [["", "sepolia"], ["sepolia:", "sepolia"], ["mainnet:", "mainnet"]]) {
    assert.deepEqual(getCredentialDocumentStore(make(`did:ethr:${prefix}${address}#test`)), { address, network });
  }
  for (const id of [`did:ethr:polygon:${address}#test`, "https://localhost/store",
    `did:ethr:${address}`, "did:ethr:0x1234#test"]) {
    assert.throws(() => getCredentialDocumentStore(make(id)), /Invalid Document Store/);
  }
  const payload = buildVCPayload({ id: "network-test", recipientName: "Test", recipientEmail: "test@example.com",
    certificateType: "Completion", issueDate: "2026-10-20", validFrom: "2026-10-20T00:00:00Z",
    description: "", documentStoreAddress: address, documentStoreNetwork: "mainnet" });
  assert.equal(payload.credentialStatus[0].id, `did:ethr:mainnet:${address}#network-test`);
});

test("Sepolia uses the working public RPC default without requiring a private endpoint", async () => {
  const { NETWORKS } = await import("./constants.ts");
  assert.equal(NETWORKS.sepolia.rpcUrl, "https://ethereum-sepolia-rpc.publicnode.com");
  assert.equal(NETWORKS.sepolia.chainId, 11155111);
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
    getDIDKeyPairFromIssuerProfile,
    issueDIDCertificate,
    signDocumentWithDID,
    signCredentialWithEthereum,
    verifyCredential,
  } = await import("./trustvc.ts");
  const { mapVcToCertEntry } = await import("./credential-mapper.ts");
  const { toCertificateTemplateData } = await import("../app/renderer/certificateView.ts");
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

  await t.test("template issuer profile selects its DID, key and display identity", async () => {
    const profileDid = "did:web:academy.example";
    const profileVerificationMethod = `${profileDid}#key-fta`;
    const profileKey = await generate({
      curve: "P-256",
      controller: profileDid,
      id: profileVerificationMethod,
    });
    const profileKeyPair = await profileKey.export({ publicKey: true, secretKey: true });
    const keyReference = "FTA_SIGNING_KEY";
    const previousProfileEnv = {
      [keyReference]: process.env[keyReference],
      [`${keyReference}_PUBLIC_KEY_MULTIBASE`]: process.env[`${keyReference}_PUBLIC_KEY_MULTIBASE`],
    };
    process.env[keyReference] = profileKeyPair.secretKeyMultibase;
    process.env[`${keyReference}_PUBLIC_KEY_MULTIBASE`] = profileKeyPair.publicKeyMultibase;
    try {
      const signingKey = getDIDKeyPairFromIssuerProfile({
        did: profileDid,
        verificationMethod: profileVerificationMethod,
        keyReference,
      });
      assert.ok(signingKey);
      const profileData = {
        ...data,
        id: "profile-signed-certificate",
        issuerDid: profileDid,
        issuerDisplayName: "FTA Institute",
        issuerName: "FTA Institute",
      };
      const payload = buildVCPayload(profileData);
      assert.equal(payload.issuer, profileDid);
      assert.equal(payload.credentialSubject.issuerDisplayName, "FTA Institute");

      const mismatchedKeyResult = await signDocumentWithDID(payload, undefined, {
        did: profileDid,
        verificationMethod: profileVerificationMethod,
        publicKeyMultibase: exported.publicKeyMultibase,
        secretKeyMultibase: profileKeyPair.secretKeyMultibase,
      });
      assert.equal(mismatchedKeyResult.signed, false);
      assert.match(mismatchedKeyResult.error, /does not match its configured public key/);

      const signed = await signDocumentWithDID(payload, undefined, {
        did: signingKey.controller,
        verificationMethod: signingKey.id,
        publicKeyMultibase: signingKey.publicKeyMultibase,
        secretKeyMultibase: signingKey.secretKeyMultibase,
      });
      assert.equal(signed.signed, true, signed.error);
      assert.equal(signed.credential.proof.verificationMethod, profileVerificationMethod);

      const profilePublicKey = await profileKey.export({ publicKey: true });
      const profileDocument = {
        "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"],
        id: profileDid,
        verificationMethod: [profilePublicKey],
        assertionMethod: [profileVerificationMethod],
      };
      const profileLoader = await getDocumentLoader({
        [profileDid]: profileDocument,
        [profileVerificationMethod]: profilePublicKey,
      });
      const disclosure = await deriveCredential(
        signed.credential,
        ["/credentialSubject"],
        { documentLoader: profileLoader }
      );
      assert.ok(disclosure.derived, disclosure.error);
      const verified = await verifyW3C(disclosure.derived, { documentLoader: profileLoader });
      assert.equal(verified.verified, true, verified.error);

      const mapped = mapVcToCertEntry(signed.credential);
      assert.equal(
        mapped.issuerName,
        "FTA Institute",
        JSON.stringify(signed.credential.credentialSubject)
      );
      assert.equal(
        toCertificateTemplateData(signed.credential, "").issuerName,
        "FTA Institute",
        JSON.stringify(signed.credential.credentialSubject)
      );
      const renderedProfile = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
        certificate: toCertificateTemplateData(signed.credential, ""),
      }));
      assert.ok(renderedProfile.includes("Certificate Owner: FTA Institute"));
    } finally {
      if (previousProfileEnv[keyReference] === undefined) delete process.env[keyReference];
      else process.env[keyReference] = previousProfileEnv[keyReference];
      if (previousProfileEnv[`${keyReference}_PUBLIC_KEY_MULTIBASE`] === undefined) {
        delete process.env[`${keyReference}_PUBLIC_KEY_MULTIBASE`];
      } else {
        process.env[`${keyReference}_PUBLIC_KEY_MULTIBASE`] =
          previousProfileEnv[`${keyReference}_PUBLIC_KEY_MULTIBASE`];
      }
    }
  });

  await t.test("certificate viewing uses a named issuer before its DID and falls back to DID", async () => {
    const { toCertificateTemplateData } = await import("../app/renderer/certificateView.ts");
    const { resolveTemplateIssuer } = await import("../app/templates/registry.ts");
    const profileCredential = {
      credentialSubject: { issuerDisplayName: "FTA Academy" },
      issuer: "did:web:fta.verifiable.sg",
    };
    assert.equal(toCertificateTemplateData(profileCredential, "").issuerName, "FTA Academy");

    const legacyCredential = { issuer: "did:web:verifiable.sg" };
    assert.equal(toCertificateTemplateData(legacyCredential, "").issuerName, "did:web:verifiable.sg");
    const didFallbackView = toCertificateTemplateData(legacyCredential, "");
    const didFallbackHtml = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
      certificate: didFallbackView,
    }));
    assert.ok(didFallbackHtml.includes("Certificate Owner: did:web:verifiable.sg"));

    const rawProfileView = {
      ...didFallbackView,
      credentialSubject: { issuerDisplayName: "FTA Academy" },
      organization: { name: "Do not use this over the issuer DID" },
    };
    const rawProfileHtml = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
      certificate: rawProfileView,
    }));
    assert.ok(rawProfileHtml.includes("Certificate Owner: FTA Academy"));

    const arraySubjectHtml = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
      certificate: {
        ...didFallbackView,
        credentialSubject: [{ issuerDisplayName: "Array Subject Academy" }],
      },
    }));
    assert.ok(arraySubjectHtml.includes("Certificate Owner: Array Subject Academy"));

    const didBeforeOrganizationHtml = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
      certificate: {
        ...didFallbackView,
        organization: { name: "Do not use this over the issuer DID" },
      },
    }));
    assert.ok(didBeforeOrganizationHtml.includes("Certificate Owner: did:web:verifiable.sg"));
    const rawIssuerIdHtml = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
      certificate: {
        ...didFallbackView,
        issuerName: "Certificate Issuer",
        issuer: { id: "did:web:raw-issuer.verifiable.sg" },
      },
    }));
    assert.ok(rawIssuerIdHtml.includes("Certificate Owner: did:web:raw-issuer.verifiable.sg"));
    const rawIssuerNameHtml = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
      certificate: {
        ...didFallbackView,
        issuerName: "Certificate Issuer",
        issuer: { id: "did:web:raw-issuer.verifiable.sg", name: "Raw Issuer Name" },
      },
    }));
    assert.ok(rawIssuerNameHtml.includes("Certificate Owner: Raw Issuer Name"));

    const namedIssuerCredential = {
      issuer: { id: "did:web:verifiable.sg", name: "Verifiable.sg" },
    };
    assert.equal(toCertificateTemplateData(namedIssuerCredential, "").issuerName, "Verifiable.sg");
    const legacyTemplateHtml = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
      certificate: {
        ...toCertificateTemplateData({ credentialSubject: {} }, ""),
        templateId: "fta",
      },
    }));
    assert.ok(legacyTemplateHtml.includes("Certificate Owner: Fintech Academy"));

    const embeddedRendererHtml = renderToStaticMarkup(createElement(CertificateTemplateRenderer, {
      certificate: toCertificateTemplateData(profileCredential, ""),
      footerIssuerName: resolveTemplateIssuer("fta"),
    }));
    assert.ok(embeddedRendererHtml.includes("Certificate Owner: Fintech Academy"));
  });

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
      assert.equal(viewed.id, data.id, "gallery view uses the issued certificate ID for its QR link");
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

  await t.test("opt-in embedded renderMethod is signed, mandatory and renderable", async () => {
    const {
      withEmbeddedRenderMethod,
      EMBEDDED_RENDERER_URL,
      RENDER_METHOD_CONTEXT_V2_URL,
    } = await import("./trustvc.ts");
    const { toCertificateTemplateData, getRendererTemplates } = await import("../app/renderer/certificateView.ts");
    assert.equal(EMBEDDED_RENDERER_URL, "https://www.verifiable.sg/renderer/");
    assert.throws(() => withEmbeddedRenderMethod(buildVCPayload(data), "../x"), /template name/);

    for (const mode of ["standard", "opencerts"]) {
      const legacy = buildVCPayload({ ...data, templateId: "fta" }, mode);
      assert.equal("renderMethod" in legacy, false, "render method must stay opt-in");
      const payload = withEmbeddedRenderMethod(legacy, "fta");
      assert.equal(payload["@context"].at(-1), RENDER_METHOD_CONTEXT_V2_URL);
      assert.equal(legacy["@context"].includes(RENDER_METHOD_CONTEXT_V2_URL), false);
      const [expanded] = await jsonld.expand(payload, { documentLoader, safe: true });
      const [renderMethod] = expanded["https://www.w3.org/2018/credentials#renderMethod"];
      assert.equal(renderMethod["@id"], EMBEDDED_RENDERER_URL);
      assert.deepEqual(renderMethod["@type"], ["https://example.org/terms#EmbeddedRenderer"]);
      assert.equal(renderMethod["https://example.org/terms#templateName"][0]["@value"], "fta");

      const result = await signDocumentWithDID(payload);
      assert.equal(result.signed, true, result.error);
      assert.throws(() => withEmbeddedRenderMethod(result.credential, "fta"), /before the credential is signed/);

      // TradeTrust derives with no selective pointers; renderMethod must remain disclosed.
      const minimal = await deriveCredential(result.credential, [], { documentLoader });
      assert.ok(minimal.derived, minimal.error);
      assert.deepEqual(minimal.derived.renderMethod, payload.renderMethod);
      assert.equal((await verifyW3C(minimal.derived, { documentLoader })).verified, true);

      const tampered = structuredClone(result.credential);
      tampered.renderMethod[0].templateName = "classic";
      const tamperedDisclosure = await deriveCredential(tampered, [], { documentLoader });
      if (tamperedDisclosure.derived) {
        assert.equal((await verifyW3C(tamperedDisclosure.derived, { documentLoader })).verified, false);
      } else {
        assert.ok(tamperedDisclosure.error);
      }

      const signed = JSON.parse(JSON.stringify(result.credential));
      assert.deepEqual(getRendererTemplates(signed), [
        { id: "fta", label: "FTA Academy", type: "custom-template" },
      ]);
      const viewed = toCertificateTemplateData(signed, "https://verifiable.sg/verify/");
      assert.equal(viewed.recipientName, data.recipientName);
      assert.equal(viewed.certificateType, data.certificateType);
      assert.equal(viewed.id, data.id);
      assert.equal(viewed.templateId, "fta");
      const html = renderToStaticMarkup(createElement(CertificateTemplateRenderer, { certificate: viewed }));
      assert.ok(html.includes(data.recipientName));
      assert.ok(html.includes("FINTECH"));
    }
    assert.equal(toCertificateTemplateData({ credentialSubject: { templateId: "modern" } }, "").templateId, "modern");
    assert.equal(toCertificateTemplateData({ renderMethod: [{ templateName: "unknown" }] }, "").templateId, "classic");
  });

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

      const missingStore = storeProvider({ issued: false });
      const withStatus = await verifyCredential(result.credential, {
        documentLoader: publicLoader, documentStoreProvider: missingStore.provider,
      });
      missingStore.provider.destroy();
      assert.equal(withStatus.valid, false);
      assert.equal(withStatus.details.signatureVerification, "verified");
      assert.equal(withStatus.details.credentialStatus, "not issued");
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

      const { withEmbeddedRenderMethod } = await import("./trustvc.ts");
      const rendered = await signDocumentWithDID(withEmbeddedRenderMethod(unsigned, "fta"));
      assert.equal(rendered.signed, true, rendered.error);
      const renderedResult = await verifyCredential(rendered.credential, { documentLoader: publicLoader });
      assert.equal(renderedResult.valid, true, renderedResult.message);
      const changedRenderer = structuredClone(rendered.credential);
      changedRenderer.renderMethod[0].id = "https://attacker.example/renderer/";
      assert.equal((await verifyCredential(changedRenderer, { documentLoader: publicLoader })).valid, false);

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

  await t.test("signed Document Store status checks the signed hash, address and network and fails closed", async () => {
    const issued = await signDocumentWithDID(buildVCPayload({ ...data, issuingMethods: ["did", "ethereum"] }));
    assert.equal(issued.signed, true, issued.error);
    const original = JSON.stringify(issued.credential);
    for (const [config, expected] of [
      [{}, "verified"], [{ issued: false }, "not issued"], [{ revoked: true }, "revoked"],
      [{ fail: true }, "unavailable"], [{ chainId: 1 }, "unavailable"],
    ]) {
      const { provider, calls } = storeProvider(config);
      try {
        const result = await verifyCredential(issued.credential, { documentLoader, documentStoreProvider: provider });
        assert.equal(result.valid, expected === "verified", result.message);
        assert.equal(result.details.credentialStatus, expected);
        if (calls.length) {
          assert.equal(calls[0].hash, issued.credential.credentialStatus[0].targetHash);
          assert.equal(calls[0].address.toLowerCase(),
            issued.credential.credentialStatus[0].id.split("#")[0].slice("did:ethr:".length).toLowerCase());
        }
        if (config.issued === false) assert.equal(calls.some((call) => call.method === "isRevoked"), false);
      } finally { provider.destroy(); }
    }
    assert.equal(JSON.stringify(issued.credential), original);
    for (const status of [
      { type: "UnknownStatus", id: "https://example.com" },
      { type: "OpenAttestationDocumentStore", id: "https://127.0.0.1", targetHash: `0x${"a".repeat(64)}` },
      { type: "OpenAttestationDocumentStore", id: "did:ethr:0x814D9c222D3b5A8282e0467Fa12b24C057731dD6#test" },
    ]) {
      const payload = { ...buildVCPayload(data), credentialStatus: [status] };
      // Signing injects a targetHash for the application status type.
      const signed = await signDocumentWithDID(payload);
      assert.equal(signed.signed, true, signed.error);
      const { provider } = storeProvider({ issued: false });
      try {
        const result = await verifyCredential(signed.credential, { documentLoader, documentStoreProvider: provider });
        assert.equal(result.valid, false);
        assert.ok(["unsupported", "invalid", "not issued"].includes(result.details.credentialStatus));
      } finally { provider.destroy(); }
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
    assert.match(current.credentialSubject.encodedList, /^H4sI[A-Za-z0-9_-]+$/, "TrustVC-compatible bare base64url");
    const { StatusList } = require("@trustvc/w3c-credential-status");
    assert.equal((await StatusList.decode(current.credentialSubject)).getStatus(1), false,
      "TradeTrust/TrustVC decoder must accept published lists");
    const bytes = gunzipSync(Buffer.from(current.credentialSubject.encodedList, "base64url"));
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
    const multibase = await signDocumentWithDID({ ...rawList, credentialSubject: { ...rawList.credentialSubject,
      encodedList: `u${rawList.credentialSubject.encodedList}` } });
    assert.equal((await verifyCredential(issued.credential, {
      documentLoader: await makeLoader(multibase.credential, suspended),
    })).valid, true, "W3C Multibase-prefixed lists remain accepted");
    for (const subjectPatch of [
      { id: "https://other.example/#list" }, { ttl: 120000 },
      { encodedList: current.credentialSubject.encodedList.slice(1) },
      { encodedList: `u${gzipSync(Buffer.alloc(16385)).toString("base64url")}` },
      { encodedList: gzipSync(Buffer.alloc(16383)).toString("base64url") },
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
