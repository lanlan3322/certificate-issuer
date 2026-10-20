import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";

interface LoaderResult {
  contextUrl: string | null;
  document: unknown;
  documentUrl?: string;
}

type BaseDocumentLoader = (url: string) => Promise<LoaderResult>;
type Address = { address: string; family: 4 | 6 };
type SafeLoaderOptions = {
  lookupAll?: (hostname: string) => Promise<Address[]>;
  fetchJson?: (url: URL, address: Address) => Promise<{ document: unknown; redirect?: string }>;
};

const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

function ipv4ToNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return null;
  return octets.reduce((value, octet) => (value * 256 + octet) >>> 0, 0);
}

function inIpv4Range(address: number, network: string, prefix: number): boolean {
  const base = ipv4ToNumber(network);
  if (base === null) return true;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (base & mask);
}

export function isPublicInternetAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4ToNumber(address);
    if (value === null) return false;
    const blocked: Array<[string, number]> = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
      ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
      ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
      ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !blocked.some(([network, prefix]) => inIpv4Range(value, network, prefix));
  }
  if (family !== 6 || address.includes("%")) return false;

  const groups = expandIpv6(address);
  if (!groups) return false;
  const first = groups[0];
  const isGlobalUnicast = first >= 0x2000 && first <= 0x3fff;
  const isDocumentation = first === 0x2001 && groups[1] === 0x0db8;
  const isSpecialProtocol = first === 0x2001 && groups[1] <= 0x01ff;
  const is6to4 = first === 0x2002;
  return isGlobalUnicast && !isDocumentation && !isSpecialProtocol && !is6to4;
}

function expandIpv6(address: string): number[] | null {
  if (address.includes(".")) return null;
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some((group) => !/^[\da-f]{1,4}$/i.test(group))) return null;
  const omitted = 8 - left.length - right.length;
  if ((halves.length === 1 && omitted !== 0) || (halves.length === 2 && omitted < 1)) return null;
  return [
    ...left.map((group) => parseInt(group, 16)),
    ...Array(omitted).fill(0),
    ...right.map((group) => parseInt(group, 16)),
  ];
}

export function didWebDocumentUrl(did: string): string {
  if (!did.startsWith("did:web:")) throw new Error("Only did:web identifiers can be resolved remotely.");
  const methodSpecificId = did.slice("did:web:".length);
  if (!methodSpecificId || /[#/?\\]/.test(methodSpecificId)) {
    throw new Error("Invalid did:web identifier.");
  }
  const parts = methodSpecificId.split(":").map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      throw new Error("Invalid did:web encoding.");
    }
  });
  const authority = parts[0];
  const parsed = new URL(`https://${authority}`);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (parsed.username || parsed.password || isIP(hostname) || parsed.pathname !== "/" ||
      parsed.search || parsed.hash || !hostname || parsed.port === "0") {
    throw new Error("did:web must use a public DNS hostname.");
  }
  if (parts.slice(1).some((part) => !part || part === "." || part === ".." || /[\/\\?#]/.test(part))) {
    throw new Error("Invalid did:web path.");
  }
  const path = parts.length === 1
    ? "/.well-known/did.json"
    : `/${parts.slice(1).map(encodeURIComponent).join("/")}/did.json`;
  return new URL(path, parsed.origin).href;
}

async function resolvePublicAddresses(hostname: string): Promise<Address[]> {
  if (!hostname || isIP(hostname)) throw new Error("Remote document host must be a DNS name.");
  const records = await lookup(hostname, { all: true, verbatim: true });
  const addresses = records.map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicInternetAddress(address))) {
    throw new Error("Remote document host resolves to a non-public network address.");
  }
  return addresses;
}

function requestJson(url: URL, pinnedAddress: Address): Promise<{ document: unknown; redirect?: string }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      method: "GET",
      headers: { Accept: "application/did+json, application/json" },
      lookup: (_hostname, _options, callback) => {
        callback(null, pinnedAddress.address, pinnedAddress.family);
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        resolve({ document: null, redirect: response.headers.location });
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`Remote document request returned HTTP ${status}.`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > MAX_RESPONSE_BYTES) {
          req.destroy(new Error("Remote document response exceeds the size limit."));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => {
        try {
          resolve({ document: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
        } catch {
          reject(new Error("Remote document response is not valid JSON."));
        }
      });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () =>
      req.destroy(new Error("Remote document request timed out."))
    );
    req.on("error", reject);
    req.end();
  });
}

async function fetchPublicJson(
  url: URL,
  options: SafeLoaderOptions,
  redirectCount = 0
): Promise<{ document: unknown; documentUrl: string }> {
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("Remote documents must use HTTPS without credentials or fragments.");
  }
  const addresses = await (options.lookupAll ?? resolvePublicAddresses)(url.hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicInternetAddress(address))) {
    throw new Error("Remote document host resolves to a non-public network address.");
  }
  const response = await (options.fetchJson ?? requestJson)(url, addresses[0]);
  if (response.redirect) {
    if (redirectCount >= MAX_REDIRECTS) throw new Error("Remote document exceeded the redirect limit.");
    return fetchPublicJson(new URL(response.redirect, url), options, redirectCount + 1);
  }
  return { document: response.document, documentUrl: url.href };
}

export function createSafeDocumentLoader(
  baseLoader: BaseDocumentLoader,
  localContextUrls: ReadonlySet<string>,
  localDidUrls: ReadonlySet<string>,
  options: SafeLoaderOptions = {}
): BaseDocumentLoader {
  const didDocuments = new Map<string, Promise<{ document: Record<string, unknown>; documentUrl: string }>>();
  const loadDidDocument = (did: string) => {
    let pending = didDocuments.get(did);
    if (!pending) {
      pending = (async () => {
        const url = new URL(didWebDocumentUrl(did));
        const result = await fetchPublicJson(url, options);
        if (!result.document || typeof result.document !== "object" ||
            Array.isArray(result.document) ||
            (result.document as Record<string, unknown>).id !== did) {
          throw new Error("Resolved DID document does not match the requested DID.");
        }
        return {
          document: result.document as Record<string, unknown>,
          documentUrl: result.documentUrl,
        };
      })();
      didDocuments.set(did, pending);
    }
    return pending;
  };

  return async (url) => {
    if (localContextUrls.has(url) || localDidUrls.has(url)) return baseLoader(url);
    if (url.startsWith("did:")) {
      const [did, fragment] = url.split("#", 2);
      if (!did.startsWith("did:web:")) {
        throw new Error("Only did:web identifiers can be resolved remotely.");
      }
      const resolved = await loadDidDocument(did);
      if (!fragment) {
        return { contextUrl: null, document: resolved.document, documentUrl: url };
      }
      const methods = [
        ...(Array.isArray(resolved.document.verificationMethod)
          ? resolved.document.verificationMethod
          : []),
        ...(Array.isArray(resolved.document.assertionMethod)
          ? resolved.document.assertionMethod.filter(
              (entry: unknown) => entry && typeof entry === "object"
            )
          : []),
      ];
      const methodId = `${did}#${fragment}`;
      const method = methods.find(
        (entry: unknown) => entry && typeof entry === "object" &&
          (entry as Record<string, unknown>).id === methodId
      );
      if (!method) throw new Error(`Verification method ${methodId} was not found.`);
      return {
        contextUrl: null,
        document: {
          "@context": resolved.document["@context"],
          ...(method as Record<string, unknown>),
        },
        documentUrl: url,
      };
    }

    if (localContextUrls.has(url)) return baseLoader(url);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Remote JSON-LD document URL is invalid.");
    }
    const result = await fetchPublicJson(parsed, options);
    return { contextUrl: null, document: result.document, documentUrl: result.documentUrl };
  };
}
