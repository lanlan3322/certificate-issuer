import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PlatformStats {
  activeIssuers: number;
  totalOrganizations: number;
  totalUsers: number;
  totalCredentials: number;
  credentialsThisMonth: number;
}

async function getPlatformStats(): Promise<PlatformStats> {
  const { createClient } = await import("@supabase/supabase-js");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return {
      activeIssuers: 0,
      totalOrganizations: 0,
      totalUsers: 0,
      totalCredentials: 0,
      credentialsThisMonth: 0,
    };
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Count active organizations
  const { count: orgCount } = await supabase
    .from("organizations")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  // Count distinct active issuers
  const { count: issuerCount } = await supabase
    .from("issuers")
    .select("*", { count: "exact", head: true })
    .eq("status", "active");

  // Count total users in auth.users
  let userCount = 0;
  try {
    const { data: orgs } = await supabase.from("organizations").select("id");
    if (orgs && orgs.length > 0) {
      const inClauses = orgs.map((o) => `"${o.id}"`).join(",");
      const { count } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .in("organization_id", orgs.map((o) => o.id));
      userCount = count ?? 0;
    }
  } catch {
    // Auth table access may be restricted with service key in some setups
    userCount = 0;
  }

  // Count total issued credentials
  const { count: credCount } = await supabase
    .from("credentials")
    .select("*", { count: "exact", head: true });

  // Count credentials issued this month
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  let credThisMonth = 0;
  try {
    const { count } = await supabase
      .from("credentials")
      .select("*", { count: "exact", head: true })
      .gte("issued_at", firstDayOfMonth);
    credThisMonth = count ?? 0;
  } catch {
    credThisMonth = 0;
  }

  return {
    activeIssuers: issuerCount ?? 0,
    totalOrganizations: orgCount ?? 0,
    totalUsers: userCount,
    totalCredentials: credCount ?? 0,
    credentialsThisMonth: credThisMonth,
  };
}

export async function GET() {
  try {
    const stats = await getPlatformStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("[platform-stats] Error fetching stats:", error);
    // Return zeroes on failure to avoid breaking the landing page
    return NextResponse.json({
      activeIssuers: 0,
      totalOrganizations: 0,
      totalUsers: 0,
      totalCredentials: 0,
      credentialsThisMonth: 0,
    });
  }
}
