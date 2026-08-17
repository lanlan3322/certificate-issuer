import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "../../../lib/db";
import { TemplateService } from "../../../services/TemplateService";

export async function GET(request: Request) {
  try { const issuerId = new URL(request.url).searchParams.get("issuerId") ?? undefined; return NextResponse.json({ templates: await TemplateService.list(issuerId) }); }
  catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : "Unable to load templates." }, { status: error instanceof DatabaseConfigurationError ? 503 : 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { issuerId?: string; slug?: string; name?: string; description?: string; definition?: Record<string, unknown> };
    if (!body.slug?.trim() || !body.name?.trim()) return NextResponse.json({ error: "slug and name are required." }, { status: 400 });
    return NextResponse.json({ template: await TemplateService.create({ issuerId: body.issuerId, slug: body.slug.trim(), name: body.name.trim(), description: body.description?.trim(), definition: body.definition }) }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof DatabaseConfigurationError ? error.message : error instanceof Error ? error.message : "Unable to create template." }, { status: error instanceof DatabaseConfigurationError ? 503 : 400 }); }
}