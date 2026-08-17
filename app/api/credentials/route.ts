import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "../../../lib/db";
import { CredentialService } from "../../../services/CredentialService";

export async function GET(request: Request) {
  try { const issuerId = new URL(request.url).searchParams.get("issuerId") ?? undefined; return NextResponse.json({ credentials: await CredentialService.list(issuerId) }); }
  catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : "Unable to load credentials." }, { status: error instanceof DatabaseConfigurationError ? 503 : 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { issuerId?: string; templateId?: string; externalId?: string; recipientName?: string; recipientEmail?: string; credential?: Record<string, unknown>; documentHash?: string; issuingMethods?: string[]; validFrom?: string; validUntil?: string };
    if (!body.issuerId || !body.externalId || !body.recipientName || !body.recipientEmail || !body.credential) return NextResponse.json({ error: "issuerId, externalId, recipientName, recipientEmail, and credential are required." }, { status: 400 });
    const credential = await CredentialService.create({ issuerId: body.issuerId, templateId: body.templateId, externalId: body.externalId, recipientName: body.recipientName, recipientEmail: body.recipientEmail, credential: body.credential, documentHash: body.documentHash, issuingMethods: body.issuingMethods, validFrom: body.validFrom, validUntil: body.validUntil });
    return NextResponse.json({ credential }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : error instanceof Error ? error.message : "Unable to store credential." }, { status: error instanceof DatabaseConfigurationError ? 503 : 400 }); }
}