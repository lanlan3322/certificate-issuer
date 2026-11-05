import { getSupabaseAdmin, getSupabaseServerClient } from "../lib/supabase/server";

export interface IssuerInput {
  organizationId: string; name: string; slug: string; contactEmail: string; didUri?: string;
  displayName?: string; description?: string; website?: string | null; logoUrl?: string | null;
  verificationMethod?: string | null; keyFingerprint?: string | null;
  status?: "active" | "inactive" | "disabled" | "suspended" | "deleted";
}
export interface IssuerRecord extends IssuerInput {
  id: string; status: NonNullable<IssuerInput["status"]>; createdAt: string;
  active: boolean; updatedAt: string; displayName: string;
}
export type IssuerUserRole = "issuer-admin" | "issuer-operator" | "organization_admin" | "issuer" | "viewer";
export class IssuerInvitationError extends Error {}

export const mapIssuerRow = (row: Record<string, unknown>): IssuerRecord => ({
  id: String(row.id),
  organizationId: String(row.organization_id),
  name: String(row.name),
  slug: String(row.slug),
  contactEmail: String(row.contact_email),
  didUri: row.did_uri ? String(row.did_uri) : undefined,
  status: row.status as IssuerRecord["status"],
  createdAt: String(row.created_at),
  displayName: String(row.display_name ?? row.name),
  description: String(row.description ?? ""),
  website: row.website ? String(row.website) : null,
  logoUrl: row.logo_url ? String(row.logo_url) : null,
  verificationMethod: row.verification_method ? String(row.verification_method) : null,
  keyFingerprint: row.key_fingerprint ? String(row.key_fingerprint) : null,
  active: row.status === "active" && row.active !== false,
  updatedAt: String(row.updated_at ?? row.created_at),
});

const mapRow = mapIssuerRow;

export const IssuerService = {
  async getById(id: string) {
    const client = await getSupabaseServerClient();
    const { data, error } = await client.from("issuers").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  },
  async createWithInvitation(input: IssuerInput, role: IssuerUserRole, actorId: string, redirectTo: string) {
    const supabase = getSupabaseAdmin();
    const { data: reservation, error: reservationError } = await supabase.rpc("prepare_issuer_invitation", {
      p_organization_id: input.organizationId,
      p_name: input.name,
      p_slug: input.slug,
      p_email: input.contactEmail,
      p_role: role,
      p_actor_id: actorId,
      p_did_uri: input.didUri ?? null,
    });
    if (reservationError) throw reservationError;
    if (!reservation?.issuer || !reservation.user_id) {
      throw new Error("Issuer invitation reservation is incomplete.");
    }
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(input.contactEmail, { redirectTo });
    if (error || !data.user) {
      throw new IssuerInvitationError(
        "Issuer saved, but the login invitation could not be sent. Retry with the same details or contact a platform administrator. Existing login accounts cannot be invited as new users."
      );
    }
    const { error: linkError } = await supabase.rpc("complete_issuer_invitation", {
      p_user_id: reservation.user_id,
      p_auth_user_id: data.user.id,
      p_actor_id: actorId,
    });
    if (linkError) {
      throw new IssuerInvitationError(
        "Invitation sent, but the login profile could not be linked. Contact a platform administrator before retrying."
      );
    }
    return mapRow(reservation.issuer);
  },
  async list(organizationId: string) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("issuers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  async create(input: IssuerInput) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("issuers")
      .insert({
        organization_id: input.organizationId,
        name: input.name,
        slug: input.slug,
        contact_email: input.contactEmail,
        did_uri: input.didUri ?? null,
        display_name: input.displayName ?? input.name,
        description: input.description ?? "",
        website: input.website ?? null,
        logo_url: input.logoUrl ?? null,
        verification_method: input.verificationMethod ?? null,
        key_fingerprint: input.keyFingerprint ?? null,
        status: input.status ?? "active",
      })
      .select()
      .single();
    if (error) throw error;
    return mapRow(data);
  },

  async updateStatus(id: string, status: IssuerRecord["status"], organizationId: string) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase
      .from("issuers")
      .update({ status })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new Error("Issuer not found.");
    return mapRow(data);
  },

  async update(id: string, organizationId: string, input: Partial<Omit<IssuerInput, "organizationId" | "didUri">> & { didUri?: string | null }) {
    const supabase = await getSupabaseServerClient();
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.contactEmail !== undefined) updates.contact_email = input.contactEmail;
    if (input.didUri !== undefined) updates.did_uri = input.didUri;
    for (const [source, target] of [
      ["displayName","display_name"],["slug","slug"],["description","description"],
      ["website","website"],["logoUrl","logo_url"],["verificationMethod","verification_method"],
      ["keyFingerprint","key_fingerprint"],["status","status"],
    ] as const) {
      if (input[source] !== undefined) updates[target] = input[source];
    }

    const { data, error } = await supabase
      .from("issuers")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();
    if (error) throw error;
    if (!data) throw new Error("Issuer not found.");
    return mapRow(data);
  },

};
