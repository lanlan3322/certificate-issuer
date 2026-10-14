import { NextResponse } from "next/server";
import { buildPublicDID, publicDocumentHeaders } from "../../../../lib/did-publication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { jwks } = buildPublicDID();
    const headers = publicDocumentHeaders(jwks, "application/jwk+json");
    if (request.headers.get("if-none-match") === headers.ETag) {
      return new NextResponse(null, { status: 304, headers });
    }
    return NextResponse.json(jwks, { headers });
  } catch (error) {
    console.error("JWKS publication configuration is invalid.", error);
    return NextResponse.json(
      { error: "JWKS publication is not configured correctly. Contact the issuer administrator." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
