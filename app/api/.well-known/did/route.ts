import { NextResponse } from "next/server";
import {
  buildIssuerProfileDID,
  buildPublicDID,
  LEGACY_DID_ID,
  publicDocumentHeaders,
} from "../../../../lib/did-publication";
import { IssuerProfileService } from "../../../../services/IssuerProfileService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
    const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
    const hostname = new URL(`https://${host}`).hostname.toLowerCase();
    const did = `did:web:${hostname}`;
    let document;
    if (did === LEGACY_DID_ID) {
      document = buildPublicDID().document;
    } else {
      const profile = await IssuerProfileService.getForPublicDID(did);
      if (!profile) {
        return NextResponse.json(
          { error: "DID document not found." },
          { status: 404, headers: { "Cache-Control": "no-store" } }
        );
      }
      document = buildIssuerProfileDID(profile).document;
    }
    const headers = publicDocumentHeaders(document, "application/did+json");
    if (request.headers.get("if-none-match") === headers.ETag) {
      return new NextResponse(null, { status: 304, headers });
    }
    return new NextResponse(JSON.stringify(document), { headers });
  } catch (error) {
    console.error("DID publication configuration is invalid.", error);
    return NextResponse.json(
      { error: "DID publication is not configured correctly. Contact the issuer administrator." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
