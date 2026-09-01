import { getSupabaseServerClient } from "../lib/supabase/server";

export type RevocationAction = "revoke" | "suspend" | "reinstate";

export interface RevocationRecord {
  id: string;
  credentialId: string;
  issuerId: string;
  action: RevocationAction;
  reason: string;
  transactionHash: string | null;
  createdAt: string;
}

export class RevocationStateError extends Error {}
export class CredentialNotFoundError extends Error {}

const STATUS_FOR_ACTION: Record<RevocationAction, string> = {
  revoke: "revoked",
  suspend: "suspended",
  reinstate: "issued",
};

const mapRow = (row: Record<string, unknown>): RevocationRecord => ({
  id: String(row.id),
  credentialId: String(row.credential_id),
  issuerId: String(row.issuer_id),
  action: row.action as RevocationAction,
  reason: row.reason ? String(row.reason) : "",
  transactionHash: row.transaction_hash ? String(row.transaction_hash) : null,
  createdAt: String(row.created_at),
});

export const RevocationService = {
  async list(issuerId: string, limit = 100) {
    const supabase = await getSupabaseServerClient();
    const result = Math.min(Math.max(limit, 1), 500);

    const { data, error } = await supabase
      .from("revocations")
      .select("*, credentials(external_id, status)")
      .eq("issuer_id", issuerId)
      .order("created_at", { ascending: false })
      .limit(result);

    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      ...mapRow(row),
      externalId: row.credentials?.external_id ? String(row.credentials.external_id) : "",
      credentialStatus: row.credentials?.status ? String(row.credentials.status) : "",
    }));
  },

  async apply(input: {
    credentialRef: string;
    issuerId: string;
    action: RevocationAction;
    reason: string;
    transactionHash?: string;
  }) {
    const supabase = await getSupabaseServerClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.credentialRef);

    let lookup: { data: any; error: Error | null };
    if (isUuid) {
      lookup = await supabase.from("credentials").select("id, status, external_id")
        .eq("issuer_id", input.issuerId).eq("id", input.credentialRef).maybeSingle();
    } else {
      lookup = await supabase.from("credentials").select("id, status, external_id")
        .eq("issuer_id", input.issuerId).eq("external_id", input.credentialRef).maybeSingle();
    }

    if (lookup.error) throw lookup.error;
    const credential = lookup.data;
    if (!credential) throw new CredentialNotFoundError("Credential not found for this issuer.");

    const nextStatus = STATUS_FOR_ACTION[input.action];
    if (credential.status === "revoked" && input.action !== "reinstate") {
      throw new RevocationStateError("Credential is already revoked.");
    }
    if (credential.status === "revoked" && input.action === "reinstate") {
      throw new RevocationStateError("A revoked credential cannot be reinstated.");
    }
    if (credential.status === nextStatus) {
      throw new RevocationStateError(`Credential is already ${nextStatus}.`);
    }

    const insertResult = await supabase.from("revocations").insert({
      credential_id: credential.id,
      issuer_id: input.issuerId,
      action: input.action,
      reason: input.reason,
      transaction_hash: input.transactionHash ?? null,
    }).select().single();

    if (insertResult.error) throw insertResult.error;
    const log = mapRow(insertResult.data);

    const updateResult = await supabase.from("credentials")
      .update({ status: nextStatus })
      .eq("id", credential.id);
    if (updateResult.error) throw updateResult.error;

    return { ...log, externalId: credential.external_id, credentialStatus: nextStatus };
  },
};
