const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPinnedLookup,
  createSafeDocumentLoader,
  didWebDocumentUrl,
  isPublicInternetAddress,
} = require("./safe-document-loader.ts");

test("pinned HTTPS lookup supports Node's single and all-address callback forms", () => {
  const address = { address: "93.184.216.34", family: 4 };
  const lookup = createPinnedLookup(address);
  let singleResult;
  let allResult;

  lookup("issuer.example", { all: false }, (error, result, family) => {
    singleResult = { error, result, family };
  });
  lookup("issuer.example", { all: true }, (error, result, family) => {
    allResult = { error, result, family };
  });

  assert.deepEqual(singleResult, { error: null, result: address.address, family: address.family });
  assert.deepEqual(allResult, { error: null, result: [address], family: undefined });
});

test("public address guard rejects private and reserved IPv4/IPv6 ranges", () => {
  for (const address of [
    "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.2", "169.254.169.254",
    "100.64.0.1", "198.18.0.1", "224.0.0.1", "240.0.0.1", "::1",
    "fc00::1", "fe80::1", "ff02::1", "2001:db8::1", "2002::1",
  ]) {
    assert.equal(isPublicInternetAddress(address), false, address);
  }
  assert.equal(isPublicInternetAddress("8.8.8.8"), true);
  assert.equal(isPublicInternetAddress("2606:4700:4700::1111"), true);
});

test("did:web identifiers become HTTPS documents without accepting path traversal or IP hosts", () => {
  assert.equal(
    didWebDocumentUrl("did:web:issuer.example"),
    "https://issuer.example/.well-known/did.json"
  );
  assert.equal(
    didWebDocumentUrl("did:web:issuer.example:academy:team"),
    "https://issuer.example/academy/team/did.json"
  );
  assert.equal(
    didWebDocumentUrl("did:web:issuer.example%3A8443"),
    "https://issuer.example:8443/.well-known/did.json"
  );
  assert.throws(() => didWebDocumentUrl("did:web:127.0.0.1"), /public DNS hostname/);
  assert.throws(() => didWebDocumentUrl("did:web:issuer.example:%2e%2e:secret"), /path/);
});

test("safe document loader pins DID resolution to public DNS results and resolves key fragments", async () => {
  const did = "did:web:issuer.example";
  const method = `${did}#key-1`;
  const didDocument = {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: did,
    verificationMethod: [{
      id: method,
      type: "Multikey",
      controller: did,
      publicKeyMultibase: "zpublic",
    }],
    assertionMethod: [method],
  };
  const requests = [];
  const loader = createSafeDocumentLoader(
    async (url) => ({ contextUrl: null, document: { url }, documentUrl: url }),
    new Set(["https://known.example/context"]),
    new Set(["did:web:local.example"]),
    {
      lookupAll: async (hostname) => {
        assert.equal(hostname, "issuer.example");
        return [{ address: "93.184.216.34", family: 4 }];
      },
      fetchJson: async (url, address) => {
        requests.push([url.href, address]);
        return { document: didDocument };
      },
    }
  );

  const resolved = await loader(did);
  assert.equal(resolved.document.id, did);
  const resolvedMethod = await loader(method);
  assert.deepEqual(resolvedMethod.document, {
    "@context": didDocument["@context"],
    ...didDocument.verificationMethod[0],
  });
  assert.equal(requests.length, 1, "DID document is cached for base DID and verification method");
  assert.equal(requests[0][1].address, "93.184.216.34");
});

test("safe document loader rejects internal DNS results and non-HTTPS contexts", async () => {
  let requestCount = 0;
  const loader = createSafeDocumentLoader(
    async (url) => ({ contextUrl: null, document: { url }, documentUrl: url }),
    new Set(),
    new Set(),
    {
      lookupAll: async () => [{ address: "127.0.0.1", family: 4 }],
      fetchJson: async () => {
        requestCount++;
        return { document: {} };
      },
    }
  );

  await assert.rejects(loader("did:web:internal.example"), /non-public network address/);
  await assert.rejects(loader("http://context.example/context.json"), /HTTPS/);
  assert.equal(requestCount, 0);
});

test("safe document loader uses local document-loader mappings without a network request", async () => {
  const loader = createSafeDocumentLoader(
    async (url) => ({ contextUrl: null, document: { url }, documentUrl: url }),
    new Set(["https://known.example/context"]),
    new Set(["did:web:local.example"]),
    {
      lookupAll: async () => {
        throw new Error("must not perform DNS lookup");
      },
    }
  );
  assert.deepEqual(await loader("https://known.example/context"), {
    contextUrl: null,
    document: { url: "https://known.example/context" },
    documentUrl: "https://known.example/context",
  });
  assert.deepEqual(await loader("did:web:local.example"), {
    contextUrl: null,
    document: { url: "did:web:local.example" },
    documentUrl: "did:web:local.example",
  });
});
