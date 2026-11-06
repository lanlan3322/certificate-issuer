import { NextResponse } from "next/server";
import { authorize, clientIp } from "../../../../../lib/apiAuth";
import { requireIssuerAccess } from "../../../../../lib/issuer-access";
import { canAccessIssuer } from "../../../../../lib/permissions";
import { ForbiddenError } from "../../../../../lib/auth";
import { IssuerKeyError } from "../../../../../lib/issuer-key-crypto";
import { IssuerKeyService } from "../../../../../services/IssuerKeyService";

export const keyHeaders = { "Cache-Control":"no-store, private", "Pragma":"no-cache", "X-Content-Type-Options":"nosniff" };
export function keyFailure(error: unknown) {
  if (error instanceof IssuerKeyError) return NextResponse.json({error:error.message},{status:error.status,headers:keyHeaders});
  if (error instanceof ForbiddenError) return NextResponse.json({error:"Issuer access denied."},{status:403,headers:keyHeaders});
  console.error("Issuer key operation failed.",{code:"ISSUER_KEY_OPERATION_FAILED"});
  return NextResponse.json({error:"Issuer key operation failed."},{status:503,headers:keyHeaders});
}
export function requireKeyOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site") {
    throw new IssuerKeyError("Same-origin authorization is required for key management.",403);
  }
}
export function keyIssuerId(request: Request) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const id = parts[parts.lastIndexOf("issuers")+1] ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new IssuerKeyError("A valid issuer identifier is required.",400);
  }
  return id;
}

export async function GET(request: Request) {
  const {user,response} = await authorize();
  if (response) { Object.entries(keyHeaders).forEach(([k,v])=>response.headers.set(k,v)); return response; }
  try {
    const issuerId = keyIssuerId(request);
    const issuer = await requireIssuerAccess(user,issuerId);
    const canManage = canAccessIssuer(user,issuer,"manage");
    const keys = await IssuerKeyService.list(issuerId,user.id,canManage);
    return NextResponse.json({keys,canManage},{headers:keyHeaders});
  } catch (error) { return keyFailure(error); }
}

export async function POST(request: Request) {
  const {user,response} = await authorize();
  if (response) { Object.entries(keyHeaders).forEach(([k,v])=>response.headers.set(k,v)); return response; }
  try {
    requireKeyOrigin(request);
    const issuerId = keyIssuerId(request);
    await requireIssuerAccess(user,issuerId,"manage",true);
    const reader = request.body?.getReader();
    if (!reader) throw new IssuerKeyError("A key action is required.",400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const {done,value} = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 1024) { await reader.cancel(); throw new IssuerKeyError("Key request is too large.",413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString()); }
    catch { throw new IssuerKeyError("A valid JSON key action is required.",400); }
    if (body?.action === "rotate") {
      await IssuerKeyService.rotate(issuerId,user.id,clientIp(request));
    } else if (body?.action === "activate" && typeof body.keyId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.keyId)) {
      await IssuerKeyService.activate(issuerId,body.keyId,user.id,clientIp(request));
    } else throw new IssuerKeyError("Use rotate, or activate with a valid keyId.",400);
    return NextResponse.json({keys:await IssuerKeyService.list(issuerId,user.id,true),canManage:true},{headers:keyHeaders});
  } catch (error) { return keyFailure(error); }
}
