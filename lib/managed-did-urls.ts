export const MANAGED_DID_PREFIX = "did:web:verifiable.sg:organizations:";
export function managedDIDSlug(did:string): string | null {
  const slug=did.startsWith(MANAGED_DID_PREFIX)?did.slice(MANAGED_DID_PREFIX.length):"";
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)?slug:null;
}
export function managedDocumentURL(did:string) {
  const slug=managedDIDSlug(did);
  if (!slug) throw new Error("Invalid managed organization DID.");
  return `https://verifiable.sg/organizations/${slug}/did.json`;
}
export function managedStatusURL(did:string,page:number,purpose:string) {
  const slug=managedDIDSlug(did);
  if (!slug || !Number.isSafeInteger(page) || page<0 || page>2147483647 ||
    !["revocation","suspension"].includes(purpose)) throw new Error("Invalid managed status URL.");
  return `https://verifiable.sg/organizations/${slug}/status-list/${page}/${purpose}`;
}
