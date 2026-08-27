import { NextRequest, NextResponse } from "next/server";

const protectedPages = ["/admin", "/branding", "/delivery", "/did", "/insurance", "/revocation", "/wallet"];
const protectedApiPrefixes = ["/api/issuers", "/api/templates", "/api/credentials", "/api/revocation"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedPage = protectedPages.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isProtectedApi = protectedApiPrefixes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  if (!isProtectedPage && !isProtectedApi) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get("trustvc_issuer_session")?.value);
  if (hasSession) return NextResponse.next();

  if (isProtectedApi) {
    return NextResponse.json({ error: "Issuer login required." }, { status: 401 });
  }

  const loginUrl = new URL("/issuer/", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/branding/:path*", "/delivery/:path*", "/did/:path*", "/insurance/:path*", "/revocation/:path*", "/wallet/:path*", "/api/issuers/:path*", "/api/templates/:path*", "/api/credentials/:path*", "/api/revocation/:path*"],
};