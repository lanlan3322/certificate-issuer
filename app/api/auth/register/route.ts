import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "../../../../lib/db";
import { registerIssuer } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { issuerName?: string; slug?: string; organizationName?: string; email?: string; displayName?: string; password?: string };
    if (!body.issuerName || !body.slug || !body.organizationName || !body.email || !body.displayName || !body.password) return NextResponse.json({ error: "All registration fields are required." }, { status: 400 });
    const account = await registerIssuer({ issuerName: body.issuerName, slug: body.slug, organizationName: body.organizationName, email: body.email, displayName: body.displayName, password: body.password });
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : error instanceof Error ? error.message : "Unable to register issuer." }, { status: error instanceof DatabaseConfigurationError ? 503 : 400 }); }
}