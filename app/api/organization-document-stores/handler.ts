import { NextResponse } from "next/server";
import { authorize } from "../../../lib/apiAuth";
import { isPlatformAdmin, normalizeRoles } from "../../../lib/permissions";
import { enforceRateLimit, RateLimitError } from "../../../lib/auth";
import { OrganizationDocumentStoreError, OrganizationDocumentStoreService } from "../../../services/OrganizationDocumentStoreService";

const headers={"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"};
function failure(error:unknown) {
  if(error instanceof OrganizationDocumentStoreError)return NextResponse.json({error:error.message},{status:error.status,headers});
  if(error instanceof RateLimitError)return NextResponse.json({error:"Connection test limit exceeded. Try again later."},{status:429,headers});
  console.error("Document Store management failed.",{code:"ORGANIZATION_STORE_FAILURE"});
  return NextResponse.json({error:"Document Store management failed."},{status:503,headers});
}
export async function GET(request:Request) {
  const {user,response}=await authorize();if(response)return response;
  try {
    const org=new URL(request.url).searchParams.get("organizationId")||user.organizationId;
    if(org!==user.organizationId&&!isPlatformAdmin(user))throw new OrganizationDocumentStoreError("Organization access denied.",403);
    return NextResponse.json({stores:await OrganizationDocumentStoreService.list(org)},{headers});
  }catch(error){return failure(error);}
}
export async function POST(request:Request) {
  const {user,response}=await authorize();if(response)return response;
  try {
    if(request.headers.get("origin")!==new URL(request.url).origin || request.headers.get("sec-fetch-site")==="cross-site")
      throw new OrganizationDocumentStoreError("Same-origin authorization is required.",403);
    if(!isPlatformAdmin(user)&&!normalizeRoles(user.roles).includes("organization_admin"))
      throw new OrganizationDocumentStoreError("Organization administration is required.",403);
    const org=new URL(request.url).searchParams.get("organizationId")||user.organizationId;
    if(org!==user.organizationId&&!isPlatformAdmin(user))throw new OrganizationDocumentStoreError("Organization access denied.",403);
    const reader=request.body?.getReader();
    if(!reader)throw new OrganizationDocumentStoreError("A Document Store action is required.",400);
    const chunks:Uint8Array[]=[];let size=0;
    try {
      for(;;) {
        const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;
        if(size>2048){await reader.cancel();throw new OrganizationDocumentStoreError("Request is too large.",413);}
        chunks.push(value);
      }
    }finally{reader.releaseLock();}
    let body;
    try{body=JSON.parse(Buffer.concat(chunks).toString());}
    catch{throw new OrganizationDocumentStoreError("Valid JSON is required.",400);}
    if(body?.action==="add") {
      if(typeof body.address!=="string"||typeof body.network!=="string")throw new OrganizationDocumentStoreError("Network and contract address are required.",400);
      await OrganizationDocumentStoreService.add(org,user.id,body.network,body.address);
    }else{
      if(typeof body?.storeId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.storeId))
        throw new OrganizationDocumentStoreError("A valid store ID is required.",400);
      switch(body.action) {
        case "approve":
          if(!isPlatformAdmin(user))throw new OrganizationDocumentStoreError("Platform approval is required.",403);
          await OrganizationDocumentStoreService.action(org,user.id,"approve",body.storeId);break;
        case "test":
        case "activate":
          await enforceRateLimit("organization-store:test",org,10,5);
          if(body.action==="activate")await OrganizationDocumentStoreService.activate(org,user.id,body.storeId);
          else await OrganizationDocumentStoreService.test(org,user.id,body.storeId);
          break;
        case "deactivate":await OrganizationDocumentStoreService.action(org,user.id,"deactivate",body.storeId);break;
        default:throw new OrganizationDocumentStoreError("Unsupported Document Store action.",400);
      }
    }
    return NextResponse.json({stores:await OrganizationDocumentStoreService.list(org)},{headers});
  }catch(error){return failure(error);}
}
