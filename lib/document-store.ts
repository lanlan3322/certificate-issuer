// -----------------------------
// Document Store Registration Service
// Handles on-chain hash registration via the OpenAttestation Document Store contract.
// All operations are non-blocking and optional.

import { Contract, isAddress, JsonRpcProvider, Wallet } from "ethers";
import { NETWORKS } from "./constants";

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
  {
    inputs: [{ internalType: "bytes32", name: "document", type: "bytes32" }],
    name: "revoke",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "document", type: "bytes32" }],
    name: "isRevoked",
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
const DEFAULT_DOCUMENT_STORE_NETWORK = "sepolia";
const DOCUMENT_STORE_PRIVATE_KEY = process.env.DOCUMENT_STORE_PRIVATE_KEY ?? "";
const ENABLE_DOC_STORE_REGISTRATION =
  process.env.ENABLE_DOCUMENT_STORE_REGISTRATION === "true" ||
  process.env.NEXT_PUBLIC_ENABLE_DOCUMENT_STORE_REGISTRATION === "true";

export interface DocumentStoreConfig {
  address: string;
  network: string;
}

function getProvider(address: string, network: string): JsonRpcProvider {
  if (!isAddress(address)) throw new Error("Invalid Document Store address.");
  if (!Object.hasOwn(NETWORKS, network)) throw new Error(`Unsupported Document Store network: ${network}`);
  const configuredNetwork = NETWORKS[network as keyof typeof NETWORKS];
  const rpcUrl = network === "sepolia"
    ? SEPOLIA_RPC_URL
    : process.env[`${network.toUpperCase()}_RPC_URL`] ?? configuredNetwork.rpcUrl;
  return new JsonRpcProvider(rpcUrl);
}

const contracts = new Map<string, Contract>();
function getDocumentStoreContract(config?: DocumentStoreConfig): Contract {
  const address = config?.address ?? DOCUMENT_STORE_ADDRESS;
  const network = config?.network ?? DEFAULT_DOCUMENT_STORE_NETWORK;
  const contractKey = `read:${network}:${address.toLowerCase()}`;
  let contract = contracts.get(contractKey);
  if (!contract) {
    contract = new Contract(address, DOCUMENT_STORE_ABI, getProvider(address, network));
    contracts.set(contractKey, contract);
  }
  return contract;
}

function getWritableDocumentStoreContract(config?: DocumentStoreConfig): Contract {
  if (!DOCUMENT_STORE_PRIVATE_KEY) {
    throw new Error("DOCUMENT_STORE_PRIVATE_KEY is required for Document Store transactions.");
  }
  const address = config?.address ?? DOCUMENT_STORE_ADDRESS;
  const network = config?.network ?? DEFAULT_DOCUMENT_STORE_NETWORK;
  const contractKey = `write:${network}:${address.toLowerCase()}`;
  let contract = contracts.get(contractKey);
  if (!contract) {
    const provider = getProvider(address, network);
    const signer = new Wallet(DOCUMENT_STORE_PRIVATE_KEY, provider);
    contract = new Contract(address, DOCUMENT_STORE_ABI, signer);
    contracts.set(contractKey, contract);
  }
  return contract;
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

export async function hashExists(targetHash: string, config?: DocumentStoreConfig): Promise<boolean> {
  try {
    const contract = getDocumentStoreContract(config);
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
  metadata?: RegistrationTxMetadata,
  config?: DocumentStoreConfig
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

  const alreadyRegistered = await hashExists(`0x${cleanHash}`, config);
  if (alreadyRegistered) {
    console.info(
      "[document-store] Hash already registered:",
      `0x${cleanHash}`,
      metadata ? `(id=${metadata?.credentialId})` : ""
    );
    return { hashExists: true, registered: false };
  }

  try {
    const contract = getWritableDocumentStoreContract(config);
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

export interface DocumentStoreRevocationResult {
  txHash?: string;
  alreadyRevoked: boolean;
}

export async function revokeHash(
  targetHash: string,
  config: DocumentStoreConfig
): Promise<DocumentStoreRevocationResult> {
  const cleanHash = targetHash.startsWith("0x") ? targetHash.slice(2) : targetHash;
  if (!/^[\da-f]{64}$/i.test(cleanHash)) {
    throw new Error("Invalid targetHash format for Document Store revocation.");
  }

  const contract = getWritableDocumentStoreContract(config);
  const hash = `0x${cleanHash}`;
  if (!(await (contract as Contract).isIssued(hash))) {
    throw new Error("Credential hash is not registered in the issuer's Document Store.");
  }
  if (await (contract as Contract).isRevoked(hash)) {
    return { alreadyRevoked: true };
  }

  const tx = await (contract as Contract).revoke(hash);
  const receipt = await tx.wait();
  if (receipt?.status !== undefined && receipt.status !== 1) {
    throw new Error("Document Store revocation transaction failed.");
  }
  return { txHash: tx.hash, alreadyRevoked: false };
}

export function isRegistered(): boolean {
  return ENABLE_DOC_STORE_REGISTRATION;
}
