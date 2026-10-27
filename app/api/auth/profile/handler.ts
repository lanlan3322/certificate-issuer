import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../../lib/apiAuth";
import { getSupabaseAdmin } from "../../../../lib/supabase/server";

export async function GET() {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const supabase = getSupabaseAdmin();
    const [{ data: details, error }, { data: organization, error: organizationError }] = await Promise.all([
      supabase.from("users").select("created_at, updated_at").eq("id", user.id).single(),
      supabase.from("organizations").select("name").eq("id", user.organizationId).single(),
    ]);
    if (error) throw error;
    if (organizationError) throw organizationError;
    return NextResponse.json({
      profile: { ...user, organizationName: organization.name, createdAt: details.created_at, updatedAt: details.updated_at },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Unable to load your profile.", 500);
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await authorize();
  if (response) return response;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((key) => key !== "displayName") ||
        !("displayName" in body) || typeof body.displayName !== "string" ||
        !body.displayName.trim() || body.displayName.trim().length > 100) {
      return NextResponse.json({ error: "Only a displayName of 1-100 characters may be updated." }, { status: 400 });
    }
    const { data, error } = await getSupabaseAdmin().from("users")
      .update({ display_name: body.displayName.trim() }).eq("id", user.id).select("updated_at").single();
    if (error) throw error;
    return NextResponse.json({ displayName: body.displayName.trim(), updatedAt: data.updated_at }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Unable to update your profile.", 500);
  }
}
