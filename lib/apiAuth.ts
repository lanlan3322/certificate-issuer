import { NextResponse } from "next/server";
import {
  ForbiddenError,
  PasswordResetDeliveryError,
  PasswordUpdateError,
  PasswordValidationError,
  RateLimitError,
  UnauthorizedError,
  type AuthUser,
  getCurrentIssuerUser,
} from "./auth";
import { SupabaseConfigurationError } from "./supabase/server";
import { hasLegacyRole, hasPermission, normalizeRoles, type Permission } from "./permissions";

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || "unknown";
}

/**
 * Resolves the signed-in issuer or returns the 401/403 response to send.
 * Every non-public route handler must start with this.
 */
export async function authorize(
  role?: string
): Promise<{ user: AuthUser; response?: never } | { user?: never; response: NextResponse }> {
  const user = await getCurrentIssuerUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Issuer login required." }, { status: 401 }) };
  }
  if (role && !(role.includes(".") ? hasPermission(user, role as Permission) : hasLegacyRole(user, role))) {
    return { response: NextResponse.json({ error: role.includes(".") ? `Requires ${role} permission.` : `Requires the ${role} role.` }, { status: 403 }) };
  }
  if (role === "credentials.issue" && !user.issuerId && !user.issuerMemberships?.length &&
      !hasPermission(user, "organizations.manage") && !normalizeRoles(user.roles).includes("organization_admin")) {
    return { response: NextResponse.json({ error: "An active issuer is required to issue credentials." }, { status: 403 }) };
  }
  return { user };
}

/** Maps known error types to status codes without leaking internals. */
export function errorResponse(error: unknown, fallback: string, fallbackStatus = 400) {
  if (error && typeof error === "object" && "code" in error && error.code === "P0001" && "message" in error) {
    const message = String(error.message);
    if (message.startsWith("SUBSCRIPTION_LIMIT:")) {
      return NextResponse.json({ error: "Plan limit reached. Request an upgrade in Billing & usage.", code: "SUBSCRIPTION_LIMIT" }, { status: 409 });
    }
    if (message.startsWith("SUBSCRIPTION_INACTIVE:")) {
      return NextResponse.json({ error: "An active subscription is required for new creation. Contact your organization administrator.", code: "SUBSCRIPTION_INACTIVE" }, { status: 403 });
    }
  }
  if (
    error instanceof SupabaseConfigurationError
  ) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof PasswordValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof PasswordUpdateError) {
    return NextResponse.json({ error: error.message, errorMessage: error.message }, { status: 400 });
  }
  if (error instanceof PasswordResetDeliveryError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  if (error instanceof RateLimitError) {
    return NextResponse.json({ error: error.message }, { status: 429 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: fallbackStatus });
}
