export const STATUS_LIST_LENGTH = 131072;
export const STATUS_LIST_TTL_MS = 60000;
export type StatusPurpose = "revocation" | "suspension";
export interface StatusSnapshotEntry {
  index: number;
  status: "issued" | "revoked" | "suspended" | "expired";
}

export function statusListURL(base: string, page: number, purpose: StatusPurpose) {
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password ||
      !Number.isSafeInteger(page) || page < 0 || page > 2147483647 ||
      !["revocation", "suspension"].includes(purpose)) {
    throw new Error("Invalid status list URL configuration.");
  }
  return new URL(`/api/status-list/${page}/${purpose}`, url.origin).href;
}

export function createBitstringEntries(base: string, allocation: number) {
  if (!Number.isSafeInteger(allocation) || allocation < 0) {
    throw new Error("Invalid durable status allocation.");
  }
  return (["revocation", "suspension"] as const).map((purpose) => {
    const url = statusListURL(base, Math.floor(allocation / STATUS_LIST_LENGTH), purpose);
    return {
      id: `${url}#${allocation % STATUS_LIST_LENGTH}`,
      type: "BitstringStatusListEntry",
      statusPurpose: purpose,
      statusListIndex: String(allocation % STATUS_LIST_LENGTH),
      statusListCredential: url,
    };
  });
}

export async function createStatusListDocument(
  url: string, issuer: string, purpose: StatusPurpose, entries: StatusSnapshotEntry[],
  now = new Date()
): Promise<Record<string, unknown>> {
  const { createRequire } = await import("node:module");
  // The installed package's ESM entry uses unsupported directory imports.
  const { StatusList } = createRequire(import.meta.url)("@trustvc/w3c-credential-status") as
    typeof import("@trustvc/w3c-credential-status");
  // Unallocated/reserved/deleted credentials must not appear active.
  const list = new StatusList({ buffer: Buffer.alloc(STATUS_LIST_LENGTH / 8, 255) });
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.index) || entry.index < 0 || entry.index >= STATUS_LIST_LENGTH ||
        !["issued", "revoked", "suspended", "expired"].includes(entry.status)) {
      throw new Error("Invalid status list database snapshot.");
    }
    list.setStatus(entry.index, purpose === "revocation"
      ? entry.status === "revoked" : entry.status === "suspended" || entry.status === "revoked");
  }
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: url,
    type: ["VerifiableCredential", "BitstringStatusListCredential"],
    issuer,
    validFrom: now.toISOString(),
    validUntil: new Date(now.getTime() + STATUS_LIST_TTL_MS).toISOString(),
    credentialSubject: {
      id: `${url}#list`,
      type: "BitstringStatusList",
      statusPurpose: purpose,
      // TradeTrust/TrustVC (w3c-credential-status 2.5) only decode bare base64url, not the
      // Multibase "u" form named by the W3C spec; our verifier accepts both forms.
      encodedList: await list.encode(),
      ttl: STATUS_LIST_TTL_MS,
    },
  };
}
