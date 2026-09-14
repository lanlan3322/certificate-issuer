import { NextResponse } from "next/server";
import { resolveDidKeyId, resolveDIDController, resolvePublicKeyJWK } from "../../../../lib/did-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cache for 5 minutes with stale-while-revalidate so public key changes propagate without cache stampedes
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { document: ReturnType<typeof buildDIDDocument>; etag: string; ts: number } | null = null;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin || "https://verifiable.sg";

  // Validate cached entry
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    const etag = JSON.stringify({ controller: resolveDIDController(), x: resolvePublicKeyJWK().x });
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { etag } });
    }
    const doc = cached.document;
    return NextResponse.json(doc, {
      status: 200,
      headers: {
        "Content-Type": "application/did+json",
        ETag: etag,
        "Cache-Control": `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}, stale-while-revalidate=60`,
      },
    });
  }

  const doc = buildDIDDocument();
  cached = { document: doc, etag: JSON.stringify({ controller: resolveDIDController(), x: resolvePublicKeyJWK().x }), ts: Date.now() };

  return NextResponse.json(doc, {
    status: 200,
    headers: {
      "Content-Type": "application/did+json",
      ETag: cached.etag,
      "Cache-Control": `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}, stale-while-revalidate=60`,
    },
  });
}

function buildDIDDocument() {
  const didController = resolveDIDController();
  const didKeyId = resolveDidKeyId();
  const { x, y } = resolvePublicKeyJWK();

  return {
    "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/jws-2020/v1"],
    id: didController,
    verificationMethod: [
      {
        id: didKeyId,
        type: "JsonWebKey2020",
        controller: didController,
        publicKeyJwk: {
          kty: "EC",
          crv: "secp256k1",
          kid: "key-1",
          x,
          y,
        },
      },
    ],
    authentication: [didKeyId],
    assertionMethod: [didKeyId],
    service: [
      {
        id: `${didController}#verification`,
        type: "OpenCertsVerificationService2021",
        serviceEndpoint: "https://verifiable.sg/verify",
      },
    ],
  };
}

