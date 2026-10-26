import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getUserSafely, isSupabaseAuthCookie } from "./lib/supabase/session";

const protectedPages = ["/admin", "/audit", "/branding", "/delivery", "/did", "/insurance", "/revocation", "/wallet"];
const protectedApiPrefixes = [
  "/api/issuers",
  "/api/templates",
  "/api/credentials",
  "/api/revocation",
  "/api/issue",
  "/api/agent/analytics",
  "/api/audit",
];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/.well-known/did.json") {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
    const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
    let hostname: string;
    try {
      hostname = new URL(`https://${host}`).hostname.toLowerCase();
    } catch {
      return NextResponse.json({ error: "Invalid DID request hostname." }, {
        status: 400, headers: { "Cache-Control": "no-store" },
      });
    }
    if (hostname !== "verifiable.sg") {
      const response = NextResponse.rewrite(new URL("/api/.well-known/did", request.url));
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }
  }
  // Browser verifiers (TradeTrust, OpenCerts) fetch these cross-origin at their
  // signed URLs, so they must not redirect and must allow any origin.
  if (pathname.startsWith("/api/status-list/") || pathname.startsWith("/api/.well-known/")) {
    const publicResponse = NextResponse.next();
    publicResponse.headers.set("Access-Control-Allow-Origin", "*");
    return publicResponse;
  }
  if (pathname.startsWith("/.well-known/")) return NextResponse.next();
  if (!pathname.endsWith("/") && !pathname.startsWith("/_next/") && !/\.[^/]+$/.test(pathname)) {
    return NextResponse.redirect(new URL(`${pathname}/${search}`, request.url), 308);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    }
  );

  // Revalidates the JWT against GoTrue and refreshes it when expired. Do not
  // replace with getSession(), which trusts the cookie without verification.
  const { user, staleSession } = await getUserSafely(supabase);
  if (staleSession) {
    // Drop dead session cookies so Server Components don't retry the refresh.
    const staleNames = request.cookies.getAll().map(({ name }) => name).filter(isSupabaseAuthCookie);
    for (const name of staleNames) request.cookies.delete(name);
    if (staleNames.length) {
      response = NextResponse.next({ request });
      for (const name of staleNames) response.cookies.delete(name);
    }
  }

  const isProtectedPage = protectedPages.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isProtectedApi = protectedApiPrefixes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  if (!isProtectedPage && !isProtectedApi) return response;
  if (user) return response;

  if (isProtectedApi) {
    return NextResponse.json({ error: "Issuer login required." }, { status: 401 });
  }

  const loginUrl = new URL("/issuer/", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Everything except static assets, so the session cookie is refreshed on
    // ordinary navigations too.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
