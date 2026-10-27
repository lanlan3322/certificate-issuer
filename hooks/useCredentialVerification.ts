"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "../lib/site";

interface VerificationCredential {
  id: string;
  externalId: string;
  credential: Record<string, unknown>;
}

export interface CredentialVerification {
  blockchain: string;
  did: string;
  message: string;
}

interface VerificationResponse {
  valid?: boolean;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
}

export function verificationColumns(
  result: VerificationResponse,
  credential: Record<string, unknown>
): CredentialVerification {
  const proofs = Array.isArray(credential.proof) ? credential.proof : [credential.proof];
  const hasDidProof = proofs.some((proof: unknown) =>
    proof !== null && typeof proof === "object" && "verificationMethod" in proof &&
    typeof proof.verificationMethod === "string" && proof.verificationMethod.startsWith("did:"));
  const details = result.details;
  const blockchain = details?.blockchainVerification;
  return {
    blockchain: blockchain === "passed" ? "Yes"
      : blockchain === "failed" ? "No"
      : blockchain === "not required" || blockchain === "skipped" ? "Not required"
      : "Unavailable",
    did: details?.signatureVerification === "verified" && details?.issuerAuthorization === "verified"
      ? "Yes" : hasDidProof ? "Not verified" : "Not applicable",
    message: result.message ?? "Verification completed.",
  };
}

export function useCredentialVerification(credentials: VerificationCredential[]) {
  const [results, setResults] = useState<Record<string, CredentialVerification>>({});
  useEffect(() => {
    const controller = new AbortController();
    setResults({});
    void (async () => {
      for (let index = 0; index < credentials.length; index++) {
        const row = credentials[index];
        if (controller.signal.aborted) return;
        try {
          const response = await fetch(withBasePath("/api/verify"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ externalId: row.externalId, credential: row.credential }),
            signal: controller.signal,
            cache: "no-store",
          });
          const payload = await response.json() as VerificationResponse;
          if (controller.signal.aborted) return;
          if (response.status === 429) {
            const limited = Object.fromEntries(credentials.slice(index).map((credential) => [
              credential.id, {
                blockchain: "Rate limited", did: "Rate limited",
                message: payload.error ?? "Verification rate limit reached. Try again later.",
              },
            ]));
            setResults((current) => ({ ...current, ...limited }));
            return;
          }
          if (!response.ok || typeof payload.valid !== "boolean") {
            throw new Error(payload.error ?? "Unable to verify certificate.");
          }
          setResults((current) => ({ ...current, [row.id]: verificationColumns(payload, row.credential) }));
        } catch (error) {
          if (controller.signal.aborted) return;
          setResults((current) => ({
            ...current,
            [row.id]: {
              blockchain: "Unavailable", did: "Unavailable",
              message: error instanceof Error ? error.message : "Unable to verify certificate.",
            },
          }));
        }
      }
    })();
    return () => controller.abort();
  }, [credentials]);
  return results;
}
