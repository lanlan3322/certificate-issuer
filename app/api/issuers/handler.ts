import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { IssuerService, IssuerInvitationError, mapIssuerRow } from "../../../services/IssuerService";
import { getSupabaseServerClient } from "../../../lib/supabase/server";
import { withBasePath } from "../../../lib/site";
import { canAccessIssuer, hasPermission, isPlatformAdmin as isPlatformAdministrator } from "../../../lib/permissions";
import { parseIssuerInput } from "../../../lib/issuer-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mutationError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "code" in error && error.code === "23505" &&
    "message" in error && String(error.message).includes("issuers_organization_code_key")) {
    return NextResponse.json({ error: "Issuer code is already used in this organization." }, { status: 409 });
  }
  return errorResponse(error, fallback);
}

export async function GET(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organization_id");
    const isPlatformAdmin = isPlatformAdministrator(user);
    if (organizationId && organizationId !== "all") {
      if (organizationId !== user.organizationId && !isPlatformAdmin) {
        return NextResponse.json({ error: "Requires access to the requested organization." }, { status: 403 });
      }
      return NextResponse.json({ issuers: (await IssuerService.list(organizationId)).filter((issuer) => canAccessIssuer(user, issuer)) });
    }
    if (!isPlatformAdmin) {
      return NextResponse.json({ issuers: (await IssuerService.list(user.organizationId)).filter((issuer) => canAccessIssuer(user, issuer)) });
    }
    const { data, error } = await (await getSupabaseServerClient())
      .from("issuers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({
      issuers: (data ?? []).map(mapIssuerRow),
    });
  } catch (error) {
    return errorResponse(error, "Unable to load issuers.", 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await authorize("issuers.manage");
  if (response) return response;
  try {
    const isPlatformAdmin = isPlatformAdministrator(user);
    if (!hasPermission(user, "issuers.manage")) {
      return NextResponse.json({ error: "Requires the issuer-admin role." }, { status: 403 });
    }

    const body = await request.json();
    const parsed = parseIssuerInput(body);
    if (!parsed.input) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { name, slug, contactEmail } = parsed.input;
    if (!name || !slug || !contactEmail) return NextResponse.json({ error: "Issuer name, code, and email are required." }, { status: 400 });
    if (body.role !== undefined && !["issuer-admin", "issuer-operator", "organization_admin", "issuer", "viewer"].includes(body.role)) {
      return NextResponse.json({ error: "role must be organization_admin, issuer, or viewer." }, { status: 400 });
    }

    const requestedOrgId = parsed.input.organizationId;
    if (requestedOrgId && requestedOrgId !== user.organizationId && !isPlatformAdmin) {
      return NextResponse.json({ error: "Requires the platform-admin role to create issuers in another organization." }, { status: 403 });
    }
    const targetOrgId = requestedOrgId || user.organizationId;
    if (parsed.input.status === "deleted" && !isPlatformAdmin) {
      return NextResponse.json({ error: "Only platform administrators may delete issuers." }, { status: 403 });
    }

    const input = {
      ...parsed.input,
      organizationId: targetOrgId,
      name,
      slug,
      contactEmail,
      didUri: body.didUri?.trim() || undefined,
    };
    if (body.role === "issuer-admin" || body.role === "issuer-operator" || body.role === "organization_admin" || body.role === "issuer" || body.role === "viewer") {
      const issuer = await IssuerService.createWithInvitation(
        { ...input, contactEmail: contactEmail.toLowerCase() },
        body.role,
        user.id,
        new URL(withBasePath("/issuer/?mode=reset"), request.url).href
      );
      return NextResponse.json({ issuer, invitationSent: true }, { status: 201 });
    }
    const issuer = await IssuerService.create(input);

    return NextResponse.json({ issuer }, { status: 201 });
  } catch (error) {
    if (error instanceof IssuerInvitationError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return mutationError(error, "Unable to create issuer.");
  }
}

export async function PATCH(request: Request) {
  return updateIssuer(request);
}

export async function updateIssuer(request: Request, issuerId?: string) {
  const { user, response } = await authorize("issuers.manage");
  if (response) return response;
  try {
    const body = await request.json();
    const id = issuerId || (typeof body?.id === "string" ? body.id.trim() : "");
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

    if (body?.organizationId) {
      if (!isPlatformAdministrator(user)) {
        return NextResponse.json({ error: "Requires the platform-admin role to transfer issuers." }, { status: 403 });
      }
      return NextResponse.json({ error: "Issuer transfers are not supported; organization ownership must be preserved." }, { status: 409 });
    }

    if (!hasPermission(user, "issuers.manage")) {
      return NextResponse.json({ error: "Requires the issuer-admin role." }, { status: 403 });
    }

    const parsed = parseIssuerInput(body, true);
    if (!parsed.input) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (!Object.keys(parsed.input).length) return NextResponse.json({ error: "At least one issuer field is required." }, { status: 400 });
    const existing = await IssuerService.getById(id);
    if (!existing || !canAccessIssuer(user, existing, "manage")) return NextResponse.json({ error: "Issuer not found." }, { status: 404 });
    if (parsed.input.status === "deleted" && !isPlatformAdministrator(user)) {
      return NextResponse.json({ error: "Only platform administrators may delete issuers." }, { status: 403 });
    }
    const issuer = await IssuerService.update(id, existing.organizationId, parsed.input);
    return NextResponse.json({ issuer });
  } catch (error) {
    return mutationError(error, "Unable to update issuer.");
  }
}
