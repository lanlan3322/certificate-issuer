import { getSupabaseAdmin, getSupabaseServerClient } from "../lib/supabase/server";
import { customerDomain, validateCustomerDocument, validateDomainLinkage, assertCustomerDeployment } from "../lib/self-managed-did";
import { IssuerKeyService } from "./IssuerKeyService";
import { ManagedDIDError } from "./ManagedDIDService";

const columns = "id,organization_id,domain,did,selected,revision,expected_document,linkage_document,linkage_expires_at,validation_status,validated_revision,checked_at,validation_message,created_at";
export const SelfManagedDIDService = {
  async get(organizationId: string) {
    const { data, error } = await (await getSupabaseServerClient()).from("self_managed_dids")
      .select(columns).eq("organization_id", organizationId).maybeSingle();
    if (error) throw new ManagedDIDError("Customer DID configuration could not be loaded.");
    if (!data) return null;
    return { ...data, expected_document: validateCustomerDocument(data.expected_document, data.domain) };
  },
  async action(organizationId: string, actorId: string, action: string, revision: number | null, payload: Record<string, unknown> = {}) {
    const { error } = await getSupabaseAdmin().rpc("phase5_did_action", {
      p_org: organizationId, p_actor: actorId, p_action: action, p_revision: revision, p_payload: payload,
    });
    if (error) throw new ManagedDIDError("DID action failed. Check administrator access, domain availability and current revision, then reload.", 409);
  },
  async configure(organizationId: string, actorId: string, domain: string) {
    let canonical: string;
    try { canonical = customerDomain(domain); }
    catch { throw new ManagedDIDError("Use a public DNS domain without scheme, path, port or Verifiable.sg hostname.", 400); }
    await this.action(organizationId, actorId, "configure", null, { domain: canonical });
  },
  async files(organizationId: string, actorId: string) {
    let config = await this.get(organizationId);
    if (!config) throw new ManagedDIDError("Configure a customer domain first.", 409);
    let renew = !config.linkage_document || !config.linkage_expires_at ||
      Date.parse(config.linkage_expires_at) <= Date.now() + 86400000;
    if (!renew) {
      try { validateDomainLinkage(config.linkage_document, config.expected_document); }
      catch { renew = true; }
    }
    if (renew) {
      const { data, error } = await getSupabaseAdmin().from("organization_verification_methods")
        .select("issuer_id,key_id,verification_method").eq("organization_id", organizationId)
        .eq("status", "active").order("verification_method").limit(1).maybeSingle();
      if (error || !data) throw new ManagedDIDError("Create an active issuer before generating the signed domain linkage file.", 409);
      const method = `${config.did}#${String(data.verification_method).split("#")[1]}`;
      const linkage = await IssuerKeyService.domainLinkage(data.issuer_id, data.key_id, config.did, method);
      await this.action(organizationId, actorId, "linkage", config.revision, linkage);
      config = await this.get(organizationId);
      if (!config) throw new ManagedDIDError();
    }
    validateDomainLinkage(config.linkage_document, config.expected_document);
    await this.action(organizationId, actorId, "download", config.revision);
    return { did: config.expected_document, configuration: config.linkage_document, revision: config.revision };
  },
  async validate(organizationId: string, actorId: string) {
    const config = await this.get(organizationId);
    if (!config) throw new ManagedDIDError("Configure a customer domain first.", 409);
    let valid = false;
    try {
      if (!config.linkage_document) throw new Error("Generate files first.");
      await assertCustomerDeployment(config);
      valid = true;
    } catch {
      // Persist an explicit failure, without logging customer-supplied response bodies.
      valid = false;
    }
    await this.action(organizationId, actorId, "validate", config.revision, { valid });
    if (!valid) throw new ManagedDIDError("Deployment validation failed. Check both HTTPS files, exact DID/public methods and linkage expiry. Redirects and private networks are rejected.", 422);
  },
  async select(organizationId: string, actorId: string, mode: "managed" | "self-managed") {
    if (mode === "self-managed") await this.validate(organizationId, actorId);
    const config = await this.get(organizationId);
    if (!config) {
      if (mode === "managed") return;
      throw new ManagedDIDError("Configure a customer domain first.", 409);
    }
    await this.action(organizationId, actorId, mode, config.revision);
  },
};
