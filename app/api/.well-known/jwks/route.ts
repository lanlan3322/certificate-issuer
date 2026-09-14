import { NextResponse } from "next/server";
import { resolveDIDController, resolvePublicKeyJWK } from "../../../../lib/did-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { keys: ReturnType<typeof buildJWKS>; etag: string; ts: number } | null = null;

export async function GET(request: Request) {
  // Validate cached entry
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    const etag = `"jwks-${resolveDIDController()}-${resolvePublicKeyJWK().x}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { etag } });
    }
    const keys = cached.keys;
    return NextResponse.json(keys, {
      status: 200,
      headers: {
        "Content-Type": "application/jwk+json",
        ETag: etag,
        "Cache-Control": `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}, stale-while-revalidate=60`,
      },
    });
  }

  const keys = buildJWKS();
  const etag = `"jwks-${resolveDIDController()}-${resolvePublicKeyJWK().x}"`;
  cached = { keys, etag, ts: Date.now() };

  return NextResponse.json(keys, {
    status: 200,
    headers: {
      "Content-Type": "application/jwk+json",
      ETag: etag,
      "Cache-Control": `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}, stale-while-revalidate=60`,
    },
  });
}

function buildJWKS() {
  const didController = resolveDIDController();
  const { x, y } = resolvePublicKeyJWK();

  return {
    "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/jws-2020/v1"],
    keys: [
      {
        kty: "EC",
        crv: "secp256k1",
        kid: "key-1",
        use: "sig",
        x,
        y,
        issuer: didController,
      },
    ],
  };
}

