import { NextResponse } from "next/server";
import {
  ForbiddenError,
  PasswordResetDeliveryError,
  PasswordValidationError,
  RateLimitError,
  UnauthorizedError,
  type AuthUser,
  getCurrentIssuerUser,
} from "./auth";
import { SupabaseConfigurationError } from "./supabase/server";

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
  if (role && !user.roles.includes(role)) {
    return { response: NextResponse.json({ error: `Requires the ${role} role.` }, { status: 403 }) };
  }
  return { user };
}

/** Maps known error types to status codes without leaking internals. */
export function errorResponse(error: unknown, fallback: string, fallbackStatus = 400) {
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
  if (error instanceof PasswordResetDeliveryError) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  if (error instanceof RateLimitError) {
    return NextResponse.json({ error: error.message }, { status: 429 });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: fallbackStatus });
}
