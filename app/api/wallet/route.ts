import { NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseServerClient } from "../../../lib/supabase/server";
import { parseStoredCredential } from "../../../lib/stored-credential";
import { walletRecord } from "../../../lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fields = "id,external_id,recipient_name,recipient_email,credential,status,issued_at,valid_from,valid_until,issuer_snapshot";
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function holder() {
  const client = await getSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email || !data.user.email_confirmed_at) return null;
  return { client, id: data.user.id, email: data.user.email.trim() };
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function audit(userId: string, credentialId: string, action: string) {
  const { error } = await getSupabaseAdmin().from("wallet_audit_events").insert({
    auth_user_id: userId, credential_id: credentialId, action,
  });
  if (error) throw error;
}

async function ownedCredential(id: string, email: string) {
  const { data, error } = await getSupabaseAdmin().from("credentials")
    .select(fields).eq("id", id).eq("recipient_email", email).maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: Request) {
  try {
    const user = await holder();
    if (!user) return NextResponse.json({ error: "Verified email sign-in required." }, { status: 401, headers });
    const id = new URL(request.url).searchParams.get("credential");
    if (id !== null) {
      if (!uuid.test(id)) return NextResponse.json({ error: "Credential not found." }, { status: 404, headers });
      const row = await ownedCredential(id, user.email);
      if (!row) return NextResponse.json({ error: "Credential not found." }, { status: 404, headers });
      const document = parseStoredCredential(row.credential);
      if (!Object.keys(document).length) throw new Error("Stored credential is invalid.");
      await audit(user.id, id, "credential.viewed");
      return NextResponse.json({ credential: walletRecord(row), document }, { headers });
    }

    const records: ReturnType<typeof walletRecord>[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await getSupabaseAdmin().from("credentials").select(fields)
        .eq("recipient_email", user.email).order("issued_at", { ascending: false })
        .order("id", { ascending: false }).range(offset, offset + 499);
      if (error) throw error;
      records.push(...(data ?? []).map(walletRecord));
      if (!data || data.length < 500) break;
    }
    const { data: profile, error } = await user.client.from("credential_profiles")
      .select("full_name,phone,country,profile_photo_url").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ userId: user.id, email: user.email, profile, credentials: records }, { headers });
  } catch (error) {
    console.error("[wallet] Unable to load wallet", error);
    return NextResponse.json({ error: "Unable to load your wallet. Please try again." }, { status: 500, headers });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
    const user = await holder();
    if (!user) return NextResponse.json({ error: "Verified email sign-in required." }, { status: 401, headers });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid profile." }, { status: 400, headers });
    }
    const input = body as Record<string, unknown>;
    if (typeof input.fullName !== "string" || input.fullName.trim().length > 200 ||
        typeof input.phone !== "string" || input.phone.length > 50 ||
        typeof input.country !== "string" || input.country.length > 100) {
      return NextResponse.json({ error: "Invalid profile fields." }, { status: 400, headers });
    }
    const { data: existing, error: lookupError } = await user.client.from("credential_profiles")
      .select("id").eq("user_id", user.id).maybeSingle();
    if (lookupError) throw lookupError;
    const profile = { full_name: input.fullName.trim(), phone: input.phone.trim(), country: input.country.trim() };
    const { error } = existing
      ? await user.client.from("credential_profiles").update(profile).eq("user_id", user.id)
      : await user.client.from("credential_profiles").insert({ user_id: user.id, ...profile });
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("[wallet] Unable to update profile", error);
    return NextResponse.json({ error: "Unable to update your profile." }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
    const user = await holder();
    if (!user) return NextResponse.json({ error: "Verified email sign-in required." }, { status: 401, headers });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid event." }, { status: 400, headers });
    }
    const { id, action } = body as Record<string, unknown>;
    if (typeof id !== "string" || !uuid.test(id) ||
        (action !== "credential.downloaded" && action !== "credential.shared" && action !== "credential.qr_generated")) {
      return NextResponse.json({ error: "Invalid event." }, { status: 400, headers });
    }
    if (!await ownedCredential(id, user.email)) return NextResponse.json({ error: "Credential not found." }, { status: 404, headers });
    await audit(user.id, id, action);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("[wallet] Unable to record wallet event", error);
    return NextResponse.json({ error: "Unable to record the wallet action." }, { status: 500, headers });
  }
}
