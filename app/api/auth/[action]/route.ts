import { dispatchApiRequest } from "../../../../lib/api-router";
import * as login from "../login/handler";
import * as logout from "../logout/handler";
import * as me from "../me/handler";
import * as reset from "../reset/handler";
import * as resetRequest from "../reset-request/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = { login, logout, me, reset, "reset-request": resetRequest };

async function dispatch(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  return dispatchApiRequest(request, routes, action);
}

export const GET = dispatch;
export const HEAD = dispatch;
export const OPTIONS = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const PATCH = dispatch;
export const DELETE = dispatch;
