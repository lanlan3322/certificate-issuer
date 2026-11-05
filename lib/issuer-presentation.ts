export function issuerPresentation(credential: Record<string, unknown> | null) {
  const subject = credential?.credentialSubject;
  const fields = subject && typeof subject === "object" && !Array.isArray(subject)
    ? subject as Record<string, unknown> : {};
  const issuer = credential?.issuer;
  const issuerObject = issuer && typeof issuer === "object" ? issuer as Record<string, unknown> : {};
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  return {
    issuerDisplayName: text(fields.issuerDisplayName) ?? text(issuerObject.name) ?? text(issuer) ?? "Not recorded",
    organizationDisplayName: text(fields.organizationDisplayName) ?? "Not recorded",
  };
}
