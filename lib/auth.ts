import { getSupabaseAdmin, getSupabasePasswordResetClient, getSupabaseServerClient } from "./supabase/server";

export interface AuthUser {
  id: string;
  issuerId: string;
  organizationId: string;
  email: string;
  displayName: string;
  issuerName: string;
  roles: string[];
}

export class PasswordResetDeliveryError extends Error {}
export class PasswordValidationError extends Error {}
export class RateLimitError extends Error {}

interface RateLimitSnapshot {
  count: number;
  windowStartedAt: string;
  oldestAttemptAt: string | null;
  limitReachedUntil: string | null;
}

function assertPassword(password: string) {
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new PasswordValidationError("Password must be at least 10 characters and include uppercase, lowercase, and a number.");
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function authLog(message: string, details?: Record<string, unknown>) {
  console.info(`[auth] ${message}`, details ?? {});
}

function windowStart(windowMinutes: number) {
  return new Date(Date.now() - windowMinutes * 60_000);
}

function addMinutes(timestamp: string, minutes: number) {
  return new Date(new Date(timestamp).getTime() + minutes * 60_000).toISOString();
}

function safeRateLimitIdentifier(bucket: string, identifier: string) {
  if (bucket.endsWith(":ip")) return identifier;
  return `${identifier.slice(0, 3)}...${identifier.slice(-3)}`;
}

async function getRateLimitSnapshot(
  bucket: string,
  identifier: string,
  limit: number,
  windowMinutes: number
): Promise<RateLimitSnapshot> {
  const admin = getSupabaseAdmin();
  const windowStartedAt = windowStart(windowMinutes).toISOString();
  const { data, count, error } = await admin
    .from("auth_rate_limits")
    .select("attempted_at", { count: "exact" })
    .eq("bucket", bucket)
    .eq("identifier", identifier)
    .gt("attempted_at", windowStartedAt)
    .order("attempted_at", { ascending: true });

  if (error) throw error;

  const oldestAttemptAt = data?.[0]?.attempted_at ?? null;
  return {
    count: count ?? data?.length ?? 0,
    windowStartedAt,
    oldestAttemptAt,
    limitReachedUntil: oldestAttemptAt && (count ?? data?.length ?? 0) >= limit ? addMinutes(oldestAttemptAt, windowMinutes) : null,
  };
}

/**
 * Fixed-window limiter backed by Postgres. Prevents credential stuffing and
 * unthrottled organization creation on the public auth routes.
 */
export async function enforceRateLimit(bucket: string, identifier: string, limit: number, windowMinutes: number) {
  const before = await getRateLimitSnapshot(bucket, identifier, limit, windowMinutes);
  const safeIdentifier = safeRateLimitIdentifier(bucket, identifier);
  authLog("rate limit configuration", {
    bucket,
    identifier: safeIdentifier,
    limit,
    windowMinutes,
    currentCount: before.count,
    windowStartedAt: before.windowStartedAt,
    limitReachedUntil: before.limitReachedUntil,
  });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("enforce_auth_rate_limit", {
    p_bucket: bucket,
    p_identifier: identifier,
    p_limit: limit,
    p_window_minutes: windowMinutes,
  });
  if (error) throw error;
  if (!data) {
    authLog("rate limit blocked", {
      bucket,
      identifier: safeIdentifier,
      limit,
      windowMinutes,
      currentCount: before.count,
      limitReachedUntil: before.limitReachedUntil,
    });
    throw new RateLimitError("Too many attempts. Try again later.");
  }
  const currentCount = before.count + 1;
  authLog("rate limit allowed", {
    bucket,
    identifier: safeIdentifier,
    limit,
    windowMinutes,
    currentCount,
    limitReachedUntil:
      currentCount >= limit
        ? addMinutes(before.oldestAttemptAt ?? new Date().toISOString(), windowMinutes)
        : null,
  });
}

function passwordResetRedirectUrl(baseUrl: string) {
  return `${baseUrl}/auth/recovery`;
}

export async function loginIssuer(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const supabase = await getSupabaseServerClient();

  const signIn = await supabase.auth.signInWithPassword({ email, password });
  // GoTrue already returns a generic message; do not distinguish unknown email
  // from wrong password.
  if (signIn.error || !signIn.data.user) throw new Error("Invalid email or password.");

  const user = await getCurrentIssuerUser();
  if (!user) {
    await supabase.auth.signOut();
    throw new Error("Invalid email or password.");
  }
  return user;
}

export async function getCurrentIssuerUser(): Promise<AuthUser | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("id, organization_id, email, display_name, roles")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (appUserError || !appUser?.organization_id) return null;

  const { data: issuer, error: issuerError } = await supabase
    .from("issuers")
    .select("id, name")
    .eq("organization_id", appUser.organization_id)
    .eq("status", "active")
    .maybeSingle();
  if (issuerError || !issuer) return null;

  return {
    id: appUser.id,
    issuerId: issuer.id,
    organizationId: appUser.organization_id,
    email: appUser.email,
    displayName: appUser.display_name,
    roles: appUser.roles ?? [],
    issuerName: issuer.name,
  };
}

export async function requireIssuerUser(role?: string): Promise<AuthUser> {
  const user = await getCurrentIssuerUser();
  if (!user) throw new UnauthorizedError("Issuer login required.");
  if (role && !user.roles.includes(role)) throw new ForbiddenError(`Requires the ${role} role.`);
  return user;
}

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

export async function logoutIssuer() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
}

export async function requestPasswordReset(emailInput: string, baseUrl: string) {
  const email = normalizeEmail(emailInput);
  const redirectTo = passwordResetRedirectUrl(baseUrl);

  const supabase = getSupabasePasswordResetClient();
  authLog("requesting password reset email", {
    emailDomain: email.split("@")[1] ?? null,
    redirectTo,
    flowType: "implicit",
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  authLog("resetPasswordForEmail response", {
    ok: !error,
    errorName: error?.name ?? null,
    errorMessage: error?.message ?? null,
    errorStatus: error?.status ?? null,
  });
  if (error) throw new PasswordResetDeliveryError(error.message);
}

/**
 * Completes a recovery flow. The caller must already hold the recovery session
 * established by the emailed recovery link.
 */
export async function resetPassword(password: string) {
  assertPassword(password);
  const supabase = await getSupabaseServerClient();
  const { data, error: sessionError } = await supabase.auth.getUser();
  authLog("password reset session lookup", {
    hasUser: Boolean(data.user),
    userId: data.user?.id ?? null,
    errorName: sessionError?.name ?? null,
    errorMessage: sessionError?.message ?? null,
    errorStatus: sessionError?.status ?? null,
  });
  if (sessionError || !data.user) throw new Error("Reset link is invalid or expired.");

  const { error } = await supabase.auth.updateUser({ password });
  authLog("updateUser password response", {
    ok: !error,
    userId: data.user.id,
    errorName: error?.name ?? null,
    errorMessage: error?.message ?? null,
    errorStatus: error?.status ?? null,
  });
  if (error) throw new Error(error.message);
}
