import { NextResponse } from "next/server";
import { enforceRateLimit, getCurrentIssuerUser, registerIssuer } from "../../../../lib/auth";
import { clientIp, errorResponse } from "../../../../lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      issuerName?: string;
      slug?: string;
      organizationName?: string;
      email?: string;
      displayName?: string;
      password?: string;
    };
    if (!body.issuerName || !body.slug || !body.organizationName || !body.email || !body.displayName || !body.password) {
      return NextResponse.json({ error: "All registration fields are required." }, { status: 400 });
    }
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(body.slug.trim().toLowerCase())) {
      return NextResponse.json(
        { error: "Slug must be 2-63 characters of lowercase letters, numbers, or hyphens." },
        { status: 400 }
      );
    }

    await enforceRateLimit("register:ip", clientIp(request), 5, 60);

    const account = await registerIssuer({
      issuerName: body.issuerName,
      slug: body.slug,
      organizationName: body.organizationName,
      email: body.email,
      displayName: body.displayName,
      password: body.password,
    });
    const user = await getCurrentIssuerUser();
    if (!user) {
      throw new Error("Registration completed but the new session could not be established.");
    }
    return NextResponse.json({ account, user }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to register issuer.");
  }
}
