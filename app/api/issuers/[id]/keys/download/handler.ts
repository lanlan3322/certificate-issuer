import { authorize, clientIp } from "../../../../../../lib/apiAuth";
import { requireIssuerAccess } from "../../../../../../lib/issuer-access";
import { IssuerKeyService } from "../../../../../../services/IssuerKeyService";
import { keyFailure, keyHeaders, keyIssuerId, requireKeyOrigin } from "../handler";

export async function POST(request: Request) {
  const {user,response} = await authorize();
  if (response) { Object.entries(keyHeaders).forEach(([k,v])=>response.headers.set(k,v)); return response; }
  try {
    requireKeyOrigin(request);
    const issuerId = keyIssuerId(request);
    await requireIssuerAccess(user,issuerId,"manage");
    const bytes = await IssuerKeyService.download(issuerId,user.id,clientIp(request));
    const responseBytes = new Uint8Array(bytes);
    bytes.fill(0);
    return new Response(responseBytes,{headers:{
      ...keyHeaders,"Content-Type":"application/zip",
      "Content-Disposition":`attachment; filename="issuer-${issuerId}-keys.zip"`,
      "Content-Security-Policy":"default-src 'none'; sandbox",
    }});
  } catch (error) { return keyFailure(error); }
}
