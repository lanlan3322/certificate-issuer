import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

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
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const pathname = request.nextUrl.pathname;
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
