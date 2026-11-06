// -----------------------------
// Document Store Registration Service
// Handles on-chain hash registration via the OpenAttestation Document Store contract.
// All operations are non-blocking and optional.

import { Contract, id, isAddress, JsonRpcProvider, Wallet } from "ethers";
import { DOCUMENT_STORE_CONFIG, NETWORKS } from "./constants";

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

const DEFAULT_DOCUMENT_STORE_ADDRESS = DOCUMENT_STORE_CONFIG.address;

const DOCUMENT_STORE_ADDRESS = process.env.DOCUMENT_STORE_ADDRESS
  ? `0x${process.env.DOCUMENT_STORE_ADDRESS.replace(/^0x/, "")}`
  : DEFAULT_DOCUMENT_STORE_ADDRESS;

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? NETWORKS.sepolia.rpcUrl;
const DEFAULT_DOCUMENT_STORE_NETWORK = "sepolia";
const ENABLE_DOC_STORE_REGISTRATION =
  process.env.ENABLE_DOCUMENT_STORE_REGISTRATION === "true" ||
  process.env.NEXT_PUBLIC_ENABLE_DOCUMENT_STORE_REGISTRATION === "true";

export interface DocumentStoreConfig {
  address: string;
  network: string;
}

export function getDefaultDocumentStoreConfig(): DocumentStoreConfig {
  return { address: DOCUMENT_STORE_ADDRESS, network: DEFAULT_DOCUMENT_STORE_NETWORK };
}

export async function testDocumentStoreConnection(config: DocumentStoreConfig): Promise<{signerAddress:string}> {
  if(config.network!=="sepolia")throw new Error("New organization Document Stores support Sepolia only.");
  const provider=getProvider(config.address,config.network);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async()=>{
        if((await provider.getNetwork()).chainId!==BigInt(NETWORKS.sepolia.chainId))throw new Error("Wrong chain.");
        if(await provider.getCode(config.address)==="0x")throw new Error("No contract.");
        const key=process.env.DOCUMENT_STORE_PRIVATE_KEY || process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY;
        if(!key)throw new Error("Transaction wallet is not configured.");
        const signerAddress=new Wallet(key).address;
        const contract=new Contract(config.address,[...DOCUMENT_STORE_ABI,
          "function hasRole(bytes32 role,address account) view returns (bool)"],provider);
        const issued=await contract.isIssued(id("verifiable.sg/document-store/connection-test"));
        if(typeof issued!=="boolean" ||
          !await contract.hasRole(id("ISSUER_ROLE"),signerAddress) ||
          !await contract.hasRole(id("REVOKER_ROLE"),signerAddress))throw new Error("Missing contract permissions.");
        return {signerAddress};
      })(),
      new Promise<never>((_,reject)=>{deadline=setTimeout(()=>reject(new Error("Connection test timed out.")),10_000);}),
    ]);
  } finally {if(deadline)clearTimeout(deadline);provider.destroy();}
}

function getProvider(address: string, network: string): JsonRpcProvider {
  if (!isAddress(address)) throw new Error("Invalid Document Store address.");
  if (!Object.hasOwn(NETWORKS, network)) throw new Error(`Unsupported Document Store network: ${network}`);
  const configuredNetwork = NETWORKS[network as keyof typeof NETWORKS];
  const rpcUrl = network === "sepolia"
    ? SEPOLIA_RPC_URL
    : process.env[`${network.toUpperCase()}_RPC_URL`] ?? configuredNetwork.rpcUrl;
  return new JsonRpcProvider(rpcUrl, configuredNetwork.chainId);
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
  const address = config?.address ?? DOCUMENT_STORE_ADDRESS;
  const network = config?.network ?? DEFAULT_DOCUMENT_STORE_NETWORK;
  const privateKey = process.env.DOCUMENT_STORE_PRIVATE_KEY ||
    (network === "sepolia" ? process.env.SEPOLIA_DEPLOYER_PRIVATE_KEY : undefined);
  if (!privateKey) {
    throw new Error("DOCUMENT_STORE_PRIVATE_KEY is required for Document Store transactions (SEPOLIA_DEPLOYER_PRIVATE_KEY is also supported on Sepolia).");
  }
  const contractKey = `write:${network}:${address.toLowerCase()}`;
  let contract = contracts.get(contractKey);
  if (!contract) {
    const provider = getProvider(address, network);
    const signer = new Wallet(privateKey, provider);
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
  } catch {
    console.error("[document-store] hashExists failed: unable to read Document Store.");
    return false;
  }
}

export async function checkHashRegistration(
  targetHash: string,
  config: DocumentStoreConfig
): Promise<{ issued: boolean; revoked: boolean }> {
  if (!/^0x[\da-f]{64}$/i.test(targetHash)) {
    throw new Error("Invalid Document Store hash.");
  }
  const provider = getProvider(config.address, config.network);
  try {
    const network = NETWORKS[config.network as keyof typeof NETWORKS];
    if ((await provider.getNetwork()).chainId !== BigInt(network.chainId)) {
      throw new Error("Document Store provider network mismatch.");
    }
    const contract = new Contract(config.address, DOCUMENT_STORE_ABI, provider);
    const issued = Boolean(await contract.isIssued(targetHash));
    return { issued, revoked: issued ? Boolean(await contract.isRevoked(targetHash)) : false };
  } finally {
    provider.destroy();
  }
}

export async function registerHash(
  targetHash: string,
  metadata?: RegistrationTxMetadata,
  config?: DocumentStoreConfig,
  onSubmitted?: (txHash: string) => Promise<void>,
  options?: { required: boolean }
): Promise<DocumentStoreRegistrationResult> {
  if (!ENABLE_DOC_STORE_REGISTRATION && !options?.required) {
    return { hashExists: false, registered: false };
  }

  const cleanHash = targetHash.startsWith("0x") ? targetHash.slice(2) : targetHash;

  if (!/^[\da-f]{64}$/i.test(cleanHash)) {
    console.error("[document-store] registerHash: invalid targetHash format.");
    return {
      hashExists: false,
      registered: false,
      error: `Invalid targetHash format: ${targetHash}`,
    };
  }

  let txHash: string | undefined;
  try {
    const alreadyRegistered = await getDocumentStoreContract(config).isIssued(`0x${cleanHash}`);
    if (alreadyRegistered) {
      console.info("[document-store] Hash already registered:", `0x${cleanHash}`,
        metadata ? `(id=${metadata.credentialId})` : "");
      return { hashExists: true, registered: false };
    }
    const contract = getWritableDocumentStoreContract(config);
    const tx = await (contract as Contract).issue(`0x${cleanHash}`);
    txHash = tx.hash;
    if (onSubmitted) await onSubmitted(tx.hash);
    const receipt = await tx.wait(1, 60_000);
    if (!receipt || receipt.status !== 1) {
      throw new Error("Document Store transaction did not succeed.");
    }
    console.info(
      "[document-store] Hash registered:",
      `0x${cleanHash}`,
      "tx =", tx.hash, "block =", receipt?.blockNumber
    );
    return { txHash: tx.hash, hashExists: true, registered: true };
  } catch {
    // Provider errors can contain credential-bearing RPC URLs.
    const message = "Unable to confirm Document Store registration. Check RPC connectivity, signer configuration and issuer permissions.";
    console.error("[document-store] registerHash failed:", message);
    return {
      ...(txHash ? { txHash } : {}),
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
  const receipt = await tx.wait(1,60_000);
  if (!receipt || receipt.status !== 1) {
    throw new Error("Document Store revocation transaction failed.");
  }
  return { txHash: tx.hash, alreadyRevoked: false };
}

export function isRegistered(): boolean {
  return ENABLE_DOC_STORE_REGISTRATION;
}
