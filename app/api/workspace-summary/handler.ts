import { NextResponse } from "next/server";
import { authorize, errorResponse } from "../../../lib/apiAuth";
import { isPlatformAdmin } from "../../../lib/permissions";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET() {
  const { user, response } = await authorize("credentials.read");
  if (response) return response;
  try {
    const client = await getSupabaseServerClient();
    const platform = isPlatformAdmin(user);
    const organizationId = user.organizationId;
    async function count(table: string, filter?: [string, string | boolean]) {
      const verification = table === "verification_logs";
      let query = client.from(table).select(verification ? "id,credentials!inner(organization_id)" : "id", { count: "exact", head: true });
      if (!platform) query = query.eq(verification ? "credentials.organization_id" : table === "organizations" ? "id" : "organization_id", organizationId);
      if (filter) query = query.eq(...filter);
      const result = await query;
      if (result.error || result.count === null) throw new Error(`Unable to count ${table}.`);
      return result.count;
    }
    // The session client retains issuer-membership RLS in addition to tenant filters.
    const [organizations, issuers, templates, credentials, revocations, verifications] = await Promise.all([
      count("organizations"), count("issuers", ["status", "active"]),
      count("templates", ["is_active", true]), count("credentials"),
      count("credentials", ["status", "revoked"]), count("verification_logs"),
    ]);
    return NextResponse.json({ organizations, issuers, templates, credentials, revocations, verifications }, {
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) { return errorResponse(error, "Workspace summary is unavailable. Try again or contact support.", 503); }
}
