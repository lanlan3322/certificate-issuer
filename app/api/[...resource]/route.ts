import { dispatchApiRequest } from "../../../lib/api-router";
import * as credentials from "../credentials/handler";
import * as credentialSend from "../credentials/send/handler";
import * as issuers from "../issuers/handler";
import * as issuersId from "../issuers/[id]/handler";
import * as issuerMembers from "../issuers/[id]/members/handler";
import * as issuerKeys from "../issuers/[id]/keys/handler";
import * as issuerKeyDownload from "../issuers/[id]/keys/download/handler";
import * as issuerProfiles from "../issuer-profiles/handler";
import * as templates from "../templates/handler";
import * as audit from "../audit/handler";
import * as revocation from "../revocation/handler";
import * as stats from "../platform/stats/handler";
import * as organizations from "../organizations/handler";
import * as organizationsId from "../organizations/[id]/handler";
import * as organizationMembers from "../organizations/[id]/members/handler";
import * as users from "../users/handler";
import * as managedDIDs from "../managed-dids/handler";
import * as selfManagedDIDs from "../self-managed-dids/handler";
import * as organizationStores from "../organization-document-stores/handler";
import * as subscriptions from "../subscriptions/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes: Record<string, any> = {
  credentials,
  "credentials/send": credentialSend,
  issuers,
  "issuers/[id]": issuersId,
  "issuers/[id]/members": issuerMembers,
  "issuers/[id]/keys": issuerKeys,
  "issuers/[id]/keys/download": issuerKeyDownload,
  "issuer-profiles": issuerProfiles,
  templates,
  audit,
  revocation,
  "platform/stats": stats,
  organizations,
  "organizations/[id]": organizationsId,
  "organizations/[id]/members": organizationMembers,
  users,
  "managed-dids":managedDIDs,
  "self-managed-dids":selfManagedDIDs,
  "organization-document-stores":organizationStores,
  subscriptions,
  "managed-dids/methods":{GET:managedDIDs.methodsGET},
  "managed-dids/download":{POST:managedDIDs.downloadPOST},
  "public/managed-did":{GET:managedDIDs.publicGET},
  "public/managed-status":{GET:managedDIDs.statusGET},
};

async function dispatch(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  const { resource } = await context.params;
  return dispatchApiRequest(request, routes, resource.join("/"));
}


export const GET = dispatch;
export const HEAD = dispatch;
export const OPTIONS = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
