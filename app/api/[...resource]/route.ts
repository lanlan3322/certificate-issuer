import { dispatchApiRequest } from "../../../lib/api-router";
import * as credentials from "../credentials/handler";
import * as issuers from "../issuers/handler";
import * as issuersId from "../issuers/[id]/handler";
import * as templates from "../templates/handler";
import * as audit from "../audit/handler";
import * as revocation from "../revocation/handler";
import * as stats from "../platform/stats/handler";
import * as organizations from "../organizations/handler";
import * as organizationsId from "../organizations/[id]/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes: Record<string, any> = {
  credentials,
  issuers,
  "issuers/[id]": issuersId,
  templates,
  audit,
  revocation,
  "platform/stats": stats,
  organizations,
  "organizations/[id]": organizationsId,
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
