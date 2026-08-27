import { transaction, query } from "./db";
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
export class RateLimitError extends Error {}

function assertPassword(password: string) {
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Password must be at least 10 characters and include uppercase, lowercase, and a number.");
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
  const result = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM auth_rate_limits WHERE bucket=$1 AND identifier=$2 AND attempted_at > now() - ($3 || ' minutes')::interval",
    [bucket, identifier, String(windowMinutes)]
  );
  if (Number(result.rows[0]?.count ?? 0) >= limit) {
    throw new RateLimitError("Too many attempts. Try again later.");
  }
  await query("INSERT INTO auth_rate_limits (bucket, identifier) VALUES ($1,$2)", [bucket, identifier]);
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

/**
 * Creates the GoTrue identity first, then the tenant rows in one transaction.
 * If the tenant transaction fails the auth user is deleted so a retry with the
 * same email is possible.
 */
export async function registerIssuer(input: {
  issuerName: string;
  slug: string;
  organizationName: string;
  email: string;
  displayName: string;
  password: string;
}) {
  assertPassword(input.password);
  const email = normalizeEmail(input.email);
  const slug = input.slug.trim().toLowerCase();
  const admin = getSupabaseAdmin();

  const created = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: false,
    user_metadata: { display_name: input.displayName.trim() },
  });
  if (created.error || !created.data.user) {
    throw new Error(created.error?.message ?? "Unable to create account.");
  }
  const authUserId = created.data.user.id;

  try {
    const account = await transaction(async (client) => {
      const organization = await client.query<{ id: string }>(
        "INSERT INTO organizations (name,slug) VALUES ($1,$2) RETURNING id",
        [input.organizationName.trim(), slug]
      );
      const issuer = await client.query<{ id: string }>(
        "INSERT INTO issuers (organization_id,name,slug,contact_email) VALUES ($1,$2,$3,$4) RETURNING id",
        [organization.rows[0].id, input.issuerName.trim(), slug, email]
      );
      const user = await client.query<{ id: string }>(
        "INSERT INTO users (organization_id,email,display_name,auth_user_id,roles) VALUES ($1,$2,$3,$4,$5) RETURNING id",
        [organization.rows[0].id, email, input.displayName.trim(), authUserId, ["issuer-admin", "issuer-operator"]]
      );
      await client.query(
        "INSERT INTO subscriptions (organization_id,plan_code,status) VALUES ($1,'starter','trialing')",
        [organization.rows[0].id]
      );
      return { userId: user.rows[0].id, issuerId: issuer.rows[0].id, organizationId: organization.rows[0].id };
    });

    const supabase = await getSupabaseServerClient();
    const signIn = await supabase.auth.signInWithPassword({ email, password: input.password });
    if (signIn.error) throw new Error(signIn.error.message);

    return account;
  } catch (error) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    throw error;
  }
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

  const result = await query<{
    user_id: string;
    issuer_id: string;
    organization_id: string;
    email: string;
    display_name: string;
    issuer_name: string;
    roles: string[];
  }>(
    `SELECT u.id AS user_id, i.id AS issuer_id, u.organization_id, u.email,
            u.display_name, i.name AS issuer_name, u.roles
     FROM users u
     JOIN issuers i ON i.organization_id = u.organization_id
     WHERE u.auth_user_id = $1 AND i.status = 'active'
     LIMIT 1`,
    [data.user.id]
  );

  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.user_id,
    issuerId: row.issuer_id,
    organizationId: row.organization_id,
    email: row.email,
    displayName: row.display_name,
    issuerName: row.issuer_name,
    roles: row.roles ?? [],
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

export async function requestPasswordReset(emailInput: string) {
  const email = normalizeEmail(emailInput);
  const baseUrl = process.env.PASSWORD_RESET_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new PasswordResetDeliveryError("PASSWORD_RESET_BASE_URL is required.");

  const admin = getSupabaseAdmin();
  const link = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${baseUrl}/issuer/?mode=reset` },
  });

  // Always respond the same way so the endpoint cannot be used to enumerate
  // registered accounts.
  if (link.error || !link.data.properties?.action_link) return { resetToken: null };

  await deliverPasswordReset({ email, resetUrl: link.data.properties.action_link });
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
