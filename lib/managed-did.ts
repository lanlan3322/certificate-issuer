import { ECDH } from "node:crypto";
import bs58 from "bs58";
import { managedDIDSlug } from "./managed-did-urls";
export {managedDIDSlug,managedDocumentURL,managedStatusURL} from "./managed-did-urls";

export interface ManagedVerificationMethod {
  id:string; type:"Multikey"; controller:string; publicKeyMultibase:string;
}
export interface ManagedDIDDocument {
  "@context":string[]; id:string; verificationMethod:ManagedVerificationMethod[];
  authentication:string[]; assertionMethod:string[];
}
export function validateManagedDocument(value:unknown,expectedDID:string):ManagedDIDDocument {
  const invalid=()=>new Error("Managed DID document is invalid.");
  if (!managedDIDSlug(expectedDID) || !value || typeof value!=="object" || Array.isArray(value)) throw invalid();
  const document=value as Record<string,unknown>;
  if (Object.keys(document).sort().join(",")!=="@context,assertionMethod,authentication,id,verificationMethod" ||
    document.id!==expectedDID || JSON.stringify(document["@context"])!==JSON.stringify([
      "https://www.w3.org/ns/did/v1","https://w3id.org/security/multikey/v1"]) ||
    !Array.isArray(document.verificationMethod) || !Array.isArray(document.authentication) ||
    !Array.isArray(document.assertionMethod)) throw invalid();
  const methods:ManagedVerificationMethod[]=[];
  const ids=new Set<string>();
  for (const raw of document.verificationMethod) {
    if (!raw || typeof raw!=="object" || Array.isArray(raw)) throw invalid();
    const method=raw as Record<string,unknown>;
    if (Object.keys(method).sort().join(",")!=="controller,id,publicKeyMultibase,type" ||
      typeof method.id!=="string" || !method.id.startsWith(`${expectedDID}#issuer-`) ||
      !/^issuer-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-key-[1-9][0-9]*$/.test(method.id.slice(expectedDID.length+1)) ||
      method.type!=="Multikey" || method.controller!==expectedDID ||
      typeof method.publicKeyMultibase!=="string" || !method.publicKeyMultibase.startsWith("z") ||
      ids.has(method.id)) throw invalid();
    const bytes=Buffer.from(bs58.decode(method.publicKeyMultibase.slice(1)));
    if (bytes.length!==35 || bytes[0]!==0x80 || bytes[1]!==0x24 || ![2,3].includes(bytes[2])) throw invalid();
    ECDH.convertKey(bytes.subarray(2),"prime256v1",undefined,undefined,"uncompressed");
    ids.add(method.id);
    methods.push({id:method.id,type:"Multikey",controller:expectedDID,publicKeyMultibase:method.publicKeyMultibase});
  }
  for (const relation of [document.authentication,document.assertionMethod]) {
    if (relation.some(id=>typeof id!=="string" || !ids.has(id)) || new Set(relation).size!==relation.length) throw invalid();
  }
  if (document.assertionMethod.length!==methods.length) throw invalid();
  return {"@context":[...document["@context"] as string[]],id:expectedDID,verificationMethod:methods,
    authentication:[...document.authentication],assertionMethod:[...document.assertionMethod]};
}
