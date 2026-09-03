import { getSupabaseAdmin, getSupabaseServerClient } from "./supabase/server";

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

function assertPassword(password: string) {
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new PasswordValidationError("Password must be at least 10 characters and include uppercase, lowercase, and a number.");
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Fixed-window limiter backed by Postgres. Prevents credential stuffing and
 * unthrottled organization creation on the public auth routes.
 */
export async function enforceRateLimit(bucket: string, identifier: string, limit: number, windowMinutes: number) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("enforce_auth_rate_limit", {
    p_bucket: bucket,
    p_identifier: identifier,
    p_limit: limit,
    p_window_minutes: windowMinutes,
  });
  if (error) throw error;
  if (!data) {
    throw new RateLimitError("Too many attempts. Try again later.");
  }
}

async function deliverPasswordReset(input: { email: string; resetUrl: string }) {
  const webhookUrl = process.env.PASSWORD_RESET_WEBHOOK_URL;
  if (!webhookUrl) return;

  if (/\/api\/auth\/reset(-request)?\/?$/i.test(webhookUrl)) {
    throw new PasswordResetDeliveryError(
      "PASSWORD_RESET_WEBHOOK_URL cannot point to this project's password-reset route. Configure an external email webhook that sends the resetUrl."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.PASSWORD_RESET_WEBHOOK_SECRET) {
      headers.Authorization = `Bearer ${process.env.PASSWORD_RESET_WEBHOOK_SECRET}`;
    }
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        event: "issuer.password_reset_requested",
        email: input.email,
        resetUrl: input.resetUrl,
        expiresInMinutes: 30,
        requestedAt: new Date().toISOString(),
      }),
    });
    if (!response.ok) throw new PasswordResetDeliveryError(`Password reset email service returned HTTP ${response.status}.`);
  } finally {
    clearTimeout(timeout);
  }
}

function passwordResetRedirectUrl(baseUrl: string) {
  return `${baseUrl}/auth/callback?mode=reset`;
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

  const webhookConfigured = Boolean(process.env.PASSWORD_RESET_WEBHOOK_URL);
  if (!webhookConfigured && process.env.NODE_ENV === "production") {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new PasswordResetDeliveryError(error.message);
    return { resetToken: null };
  }

  // Always respond the same way so the endpoint cannot be used to enumerate
  // registered accounts.
  const admin = getSupabaseAdmin();
  const link = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (link.error || !link.data.properties?.action_link) return { resetToken: null };

  if (webhookConfigured) await deliverPasswordReset({ email, resetUrl: link.data.properties.action_link });
  return {
    resetToken: process.env.NODE_ENV === "production" ? null : link.data.properties.action_link,
  };
}

/**
 * Completes a recovery flow. The caller must already hold the recovery session
 * established by the emailed link, which GoTrue exchanges for cookies.
 */
export async function resetPassword(password: string) {
  assertPassword(password);
  const supabase = await getSupabaseServerClient();
  const { data, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !data.user) throw new Error("Reset link is invalid or expired.");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}
