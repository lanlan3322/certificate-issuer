import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET() {
  const { response } = await authorize("users.manage");
  if (response) return response;
  try {
    const client = await getSupabaseServerClient();
    const users: Array<{ id: string; organization_id: string; email: string; display_name: string; roles: string[] }> = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from("users").select("id, organization_id, email, display_name, roles")
        .order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 499);
      if (error) throw error;
      users.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    return NextResponse.json({ users });
  } catch (error) { return errorResponse(error, "Unable to load users.", 500); }
}

export async function PATCH(request: Request) {
  const { response } = await authorize("users.manage");
  if (response) return response;
  try {
    const body = await request.json() as { userId?: unknown; platformAdmin?: unknown };
    if (typeof body.userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId) ||
        typeof body.platformAdmin !== "boolean") {
      return NextResponse.json({ error: "A valid userId and platformAdmin boolean are required." }, { status: 400 });
    }
    const client = await getSupabaseServerClient();
    const { error } = await client.rpc("phase1_set_platform_admin", { p_user: body.userId, p_enabled: body.platformAdmin });
    if (error) throw error;
    return NextResponse.json({ updated: true });
  } catch (error) { return errorResponse(error, "Unable to update user permissions."); }
}
