import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "../../../lib/db";
import { CredentialService } from "../../../services/CredentialService";
import { getCurrentIssuerUser } from "../../../lib/auth";

export async function GET(request: Request) {
  try { const user = await getCurrentIssuerUser(); if (!user) return NextResponse.json({ error: "Issuer login required." }, { status: 401 }); return NextResponse.json({ credentials: await CredentialService.list(user.issuerId) }); }
  catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : "Unable to load credentials." }, { status: error instanceof DatabaseConfigurationError ? 503 : 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { issuerId?: string; templateId?: string; externalId?: string; recipientName?: string; recipientEmail?: string; credential?: Record<string, unknown>; documentHash?: string; issuingMethods?: string[]; validFrom?: string; validUntil?: string };
    const user = await getCurrentIssuerUser(); if (!user) return NextResponse.json({ error: "Issuer login required." }, { status: 401 });
    if (!body.externalId || !body.recipientName || !body.recipientEmail || !body.credential) return NextResponse.json({ error: "externalId, recipientName, recipientEmail, and credential are required." }, { status: 400 });
    const credential = await CredentialService.create({ issuerId: user.issuerId, templateId: body.templateId, externalId: body.externalId, recipientName: body.recipientName, recipientEmail: body.recipientEmail, credential: body.credential, documentHash: body.documentHash, issuingMethods: body.issuingMethods, validFrom: body.validFrom, validUntil: body.validUntil });
    return NextResponse.json({ credential }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : error instanceof Error ? error.message : "Unable to store credential." }, { status: error instanceof DatabaseConfigurationError ? 503 : 400 }); }
}