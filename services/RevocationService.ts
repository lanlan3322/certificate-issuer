import { getSupabaseAdmin, getSupabaseServerClient } from "../lib/supabase/server";
import { revokeHash } from "../lib/document-store";

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
export class DocumentStoreRevocationError extends Error {}

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
      lookup = await supabase.from("credentials").select(
        "id, status, external_id, credential, issuer_profile_id, document_store_address, document_store_network"
      )
        .eq("issuer_id", input.issuerId).eq("id", input.credentialRef).maybeSingle();
    } else {
      lookup = await supabase.from("credentials").select(
        "id, status, external_id, credential, issuer_profile_id, document_store_address, document_store_network"
      )
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

    const document = typeof credential.credential === "string"
      ? JSON.parse(credential.credential) : credential.credential;
    const statuses = document?.credentialStatus;
    if (Array.isArray(statuses) && statuses.some((entry: { type?: string }) =>
      entry?.type === "BitstringStatusListEntry")) {
      let transactionHash = input.transactionHash ?? null;
      if (input.action === "revoke" && credential.issuer_profile_id &&
          (typeof document?.signature?.targetHash === "string" ||
            statuses.some((entry: { targetHash?: unknown }) => typeof entry?.targetHash === "string"))) {
        transactionHash = await revokeProfileDocumentStore(credential, document);
      }
      const { data, error } = await getSupabaseAdmin().rpc("apply_bitstring_revocation", {
        p_credential: credential.id,
        p_issuer: input.issuerId,
        p_action: input.action,
        p_reason: input.reason,
        p_transaction: transactionHash,
      });
      if (error?.message === "Invalid credential status transition") {
        throw new RevocationStateError(error.message);
      }
      if (error) throw error;
      if (!data || typeof data !== "object") throw new Error("Atomic status update returned no record.");
      return {
        ...mapRow(data),
        externalId: String(data.external_id),
        credentialStatus: String(data.credential_status),
      };
    }

    let transactionHash = input.transactionHash ?? null;
    if (input.action === "revoke" && credential.issuer_profile_id) {
      transactionHash = await revokeProfileDocumentStore(credential, document);
    }

    const insertResult = await supabase.from("revocations").insert({
      credential_id: credential.id,
      issuer_id: input.issuerId,
      action: input.action,
      reason: input.reason,
      transaction_hash: transactionHash,
    }).select().single();

    if (insertResult.error) throw insertResult.error;
    const log = mapRow(insertResult.data);

    const updateResult = await supabase.from("credentials")
      .update({ status: nextStatus })
      .eq("id", credential.id)
      .eq("issuer_id", input.issuerId);
    if (updateResult.error) throw updateResult.error;

    return { ...log, externalId: credential.external_id, credentialStatus: nextStatus };
  },
};

async function revokeProfileDocumentStore(
  credential: Record<string, unknown>,
  document: Record<string, unknown>
): Promise<string | null> {
  if (!credential.document_store_address || !credential.document_store_network) {
    throw new DocumentStoreRevocationError(
      "Credential is missing its issuance-time Document Store configuration."
    );
  }
  try {
    const result = await revokeHash(
      extractCredentialTargetHash(document),
      {
        address: String(credential.document_store_address),
        network: String(credential.document_store_network),
      }
    );
    return result.txHash ?? null;
  } catch (error) {
    console.error("[revocation] profile Document Store revocation failed", error);
    throw new DocumentStoreRevocationError(
      error instanceof Error ? error.message : "Document Store revocation failed."
    );
  }
}

function extractCredentialTargetHash(credential: Record<string, unknown>): string {
  const signature = credential.signature;
  if (signature && typeof signature === "object") {
    const targetHash = (signature as Record<string, unknown>).targetHash;
    if (typeof targetHash === "string" && /^0x[\da-f]{64}$/i.test(targetHash)) {
      return targetHash;
    }
  }

  const statuses = credential.credentialStatus;
  if (Array.isArray(statuses)) {
    for (const status of statuses) {
      if (status && typeof status === "object") {
        const targetHash = (status as Record<string, unknown>).targetHash;
        if (typeof targetHash === "string" && /^0x[\da-f]{64}$/i.test(targetHash)) {
          return targetHash;
        }
      }
    }
  }
  if (statuses && typeof statuses === "object") {
    const targetHash = (statuses as Record<string, unknown>).targetHash;
    if (typeof targetHash === "string" && /^0x[\da-f]{64}$/i.test(targetHash)) {
      return targetHash;
    }
  }
  throw new DocumentStoreRevocationError(
    "Credential does not contain a registered Document Store hash."
  );
}
