// -----------------------------
// Document Store Registration Service
// Handles on-chain hash registration via the OpenAttestation Document Store contract.
// All operations are non-blocking and optional.

import { Contract, JsonRpcProvider, Wallet } from "ethers";

const DOCUMENT_STORE_ABI = [
  {
    inputs: [{ internalType: "bytes32", name: "document", type: "bytes32" }],
    name: "issue",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "document", type: "bytes32" }],
    name: "isIssued",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
];

const DEFAULT_DOCUMENT_STORE_ADDRESS =
  "0x92600b6B5fE4D15D87d264C6cAdCcaf9D74594";

const DOCUMENT_STORE_ADDRESS = process.env.DOCUMENT_STORE_ADDRESS
  ? `0x${process.env.DOCUMENT_STORE_ADDRESS.replace(/^0x/, "")}`
  : DEFAULT_DOCUMENT_STORE_ADDRESS;

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org";
const DOCUMENT_STORE_PRIVATE_KEY = process.env.DOCUMENT_STORE_PRIVATE_KEY ?? "";
const ENABLE_DOC_STORE_REGISTRATION =
  process.env.ENABLE_DOCUMENT_STORE_REGISTRATION === "true" ||
  process.env.NEXT_PUBLIC_ENABLE_DOCUMENT_STORE_REGISTRATION === "true";

function getContract(): Contract {
  const rpcProvider = new JsonRpcProvider(SEPOLIA_RPC_URL);
  let signer: any;
  if (DOCUMENT_STORE_PRIVATE_KEY) {
    signer = new Wallet(DOCUMENT_STORE_PRIVATE_KEY, rpcProvider);
  } else {
    signer = Wallet.createRandom().connect(rpcProvider);
  }
  return new Contract(DOCUMENT_STORE_ADDRESS, DOCUMENT_STORE_ABI, signer);
}

let _contract: Contract | null = null;
function getDocumentStoreContract(): Contract {
  if (!_contract) {
    _contract = getContract();
  }
  return _contract;
}

export interface DocumentStoreRegistrationResult {
  txHash?: string;
  hashExists: boolean;
  registered: boolean;
  error?: string;
}

export interface RegistrationTxMetadata {
  credentialId: string;
  externalId: string;
  recipientEmail: string;
  issuerId: string;
}

export async function hashExists(targetHash: string): Promise<boolean> {
  try {
    const contract = getDocumentStoreContract();
    const cleanHash = targetHash.startsWith("0x") ? targetHash.slice(2) : targetHash;
    if (!/^[\da-f]{64}$/i.test(cleanHash)) {
      console.warn("[document-store] hashExists: invalid bytes32 format", targetHash);
      return false;
    }
    const isIssued = await (contract as Contract).isIssued(`0x${cleanHash}`);
    return Boolean(isIssued);
  } catch (err) {
    console.error("[document-store] hashExists failed:", err);
    return false;
  }
}

export async function registerHash(
  targetHash: string,
  metadata?: RegistrationTxMetadata
): Promise<DocumentStoreRegistrationResult> {
  if (!ENABLE_DOC_STORE_REGISTRATION) {
    return { hashExists: false, registered: false };
  }

  const cleanHash = targetHash.startsWith("0x") ? targetHash.slice(2) : targetHash;

  if (!/^[\da-f]{64}$/i.test(cleanHash)) {
    return {
      hashExists: false,
      registered: false,
      error: `Invalid targetHash format: ${targetHash}`,
    };
  }

  const alreadyRegistered = await hashExists(`0x${cleanHash}`);
  if (alreadyRegistered) {
    console.info(
      "[document-store] Hash already registered:",
      `0x${cleanHash}`,
      metadata ? `(id=${metadata?.credentialId})` : ""
    );
    return { hashExists: true, registered: false };
  }

  const contract = getDocumentStoreContract();
  const wallet = (contract as any).signer;

  if (!wallet || !wallet.privateKey || wallet.privateKey === "0x" + "0".repeat(64)) {
    console.warn("[document-store] registerHash: no deployer key configured - skipping.");
    return { hashExists: false, registered: false };
  }

  try {
    const tx = await (contract as Contract).issue(`0x${cleanHash}`);
    const receipt = await tx.wait();
    console.info(
      "[document-store] Hash registered:",
      `0x${cleanHash}`,
      "tx =", tx.hash, "block =", receipt?.blockNumber
    );
    return { txHash: tx.hash, hashExists: true, registered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[document-store] registerHash failed:", message);
    return {
      hashExists: false,
      registered: false,
      error: `On-chain registration failed: ${message}`,
    };
  }
}

export function isRegistered(): boolean {
  return ENABLE_DOC_STORE_REGISTRATION;
}
