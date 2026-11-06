import { NextResponse } from "next/server";
import { authorize } from "../../../lib/apiAuth";
import { isPlatformAdmin } from "../../../lib/permissions";
import { ManagedDIDError,ManagedDIDService } from "../../../services/ManagedDIDService";
import { StatusListService } from "../../../services/StatusListService";
import { MANAGED_DID_PREFIX } from "../../../lib/managed-did-urls";
import { publicDocumentHeaders } from "../../../lib/did-publication";

const privateHeaders={"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"};
function failure(error:unknown,publicRequest=false) {
  if (!(error instanceof ManagedDIDError)) console.error("Managed DID operation failed.",{code:"MANAGED_DID_FAILURE"});
  return NextResponse.json({error:error instanceof ManagedDIDError?error.message:"Managed DID operation failed."},
    {status:error instanceof ManagedDIDError?error.status:503,
      headers:{...privateHeaders,...(publicRequest?{"Access-Control-Allow-Origin":"*"}:{})}});
}
async function readIdentity(request:Request,download=false) {
  const {user,response}=await authorize();
  if (response) return response;
  try {
    const params=new URL(request.url).searchParams;
    const org=params.get("organizationId")||user.organizationId;
    if (org==="all" && !isPlatformAdmin(user) || org!=="all" && org!==user.organizationId && !isPlatformAdmin(user)) {
      throw new ManagedDIDError("Organization DID access denied.",403);
    }
    const identities=await ManagedDIDService.list(org==="all"?undefined:org);
    if (download) {
      if (request.headers.get("origin")!==new URL(request.url).origin || request.headers.get("sec-fetch-site")==="cross-site") {
        throw new ManagedDIDError("Same-origin authorization is required for audited downloads.",403);
      }
      if (org==="all" || identities.length!==1) throw new ManagedDIDError("Select one organization DID to download.",400);
      await ManagedDIDService.auditDownload(org,user.id);
      return new Response(JSON.stringify(identities[0].document,null,2),{headers:{
        ...privateHeaders,"Content-Type":"application/did+json",
        "Content-Disposition":'attachment; filename="did.json"',
      }});
    }
    return NextResponse.json({identities},{headers:privateHeaders});
  } catch(error){return failure(error);}
}
export function GET(request:Request) {return readIdentity(request);}
export function downloadPOST(request:Request) {return readIdentity(request,true);}
export async function methodsGET(request:Request) {
  const {user,response}=await authorize();
  if (response) return response;
  try {
    const params=new URL(request.url).searchParams,org=params.get("organizationId")||user.organizationId;
    if (org!==user.organizationId && !isPlatformAdmin(user)) throw new ManagedDIDError("Organization access denied.",403);
    const issuerId=params.get("issuerId")||undefined;
    // RLS narrows method metadata to assigned issuers; DID documents themselves are public.
    const methods=await ManagedDIDService.methods(org,issuerId);
    return NextResponse.json({methods},{headers:privateHeaders});
  }catch(error){return failure(error);}
}
export async function publicGET(request:Request) {
  try {
    const slug=new URL(request.url).searchParams.get("slug")||"";
    const document=await ManagedDIDService.publicDocument(slug);
    const headers={...publicDocumentHeaders(document,"application/did+json"),
      "Cache-Control":"public, max-age=0, must-revalidate","X-Content-Type-Options":"nosniff"};
    if (request.headers.get("if-none-match")===headers.ETag) return new Response(null,{status:304,headers});
    return new Response(JSON.stringify(document),{headers});
  }catch(error){return failure(error,true);}
}
export async function statusGET(request:Request) {
  try {
    const params=new URL(request.url).searchParams;
    const slug=params.get("slug")||"",page=params.get("page")||"",purpose=params.get("purpose");
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) || !/^(0|[1-9][0-9]{0,9})$/.test(page) ||
      Number(page)>2147483647 || !["revocation","suspension"].includes(purpose||"")) {
      throw new ManagedDIDError("Invalid managed status-list identifier.",400);
    }
    const document=await StatusListService.publishManaged(Number(page),purpose as "revocation"|"suspension",`${MANAGED_DID_PREFIX}${slug}`);
    if (!document) throw new ManagedDIDError("Status list not found.",404);
    return NextResponse.json(document,{headers:{"Cache-Control":"no-store","Access-Control-Allow-Origin":"*","Content-Type":"application/vc+ld+json"}});
  }catch(error){return failure(error,true);}
}
