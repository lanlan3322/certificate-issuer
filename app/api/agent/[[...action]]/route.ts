import { dispatchApiRequest } from "../../../../lib/api-router";
import * as agent from "../handler";
import * as session from "../session/handler";
import * as analytics from "../analytics/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = { "": agent, session, analytics };

async function dispatch(request: Request, context: { params: Promise<{ action?: string[] }> }) {
  const { action } = await context.params;
  return dispatchApiRequest(request, routes, action?.join("/") ?? "");
}

export const GET = dispatch;
export const HEAD = dispatch;
export const OPTIONS = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
