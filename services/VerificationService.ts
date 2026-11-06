import { getSupabaseAdmin, getSupabaseServerClient } from "../lib/supabase/server";
import { isIP } from "node:net";

export const VerificationService = {
  async log(input: { credentialId?: string; externalId?: string; verified: boolean; result: Record<string, unknown>; sourceIp?: string }) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("verification_logs").insert({
      credential_id: input.credentialId ?? null,
      credential_external_id: input.externalId ?? null,
      verified: input.verified,
      result: JSON.stringify(input.result),
      source_ip: input.sourceIp && isIP(input.sourceIp) ? input.sourceIp : null,
    }).select().single();
    if (error) throw error;
    return data;
  },

  async findByExternalId(externalId: string) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.from("credentials").select("*").eq("external_id", externalId).maybeSingle();
    if (error) throw error;
    return data ?? null;
  },
};
