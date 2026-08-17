import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { query, transaction } from "./db";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "trustvc_issuer_session";
const SESSION_DAYS = 7;

export interface AuthUser {
  id: string;
  issuerId: string;
  email: string;
  displayName: string;
  issuerName: string;
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const derived = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(digest, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function assertPassword(password: string) {
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Password must be at least 10 characters and include uppercase, lowercase, and a number.");
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function createSession(userId: string, issuerId: string) {
  const rawToken = randomBytes(32).toString("base64url");
  await query("INSERT INTO auth_sessions (user_id, issuer_id, token_hash, expires_at) VALUES ($1,$2,$3,now() + interval '7 days')", [userId, issuerId, hashToken(rawToken)]);
  cookies().set(SESSION_COOKIE, rawToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 24 * 60 * 60 });
}

  async function deliverPasswordReset(input: { email: string; token: string }) {
    const webhookUrl = process.env.PASSWORD_RESET_WEBHOOK_URL;
    if (!webhookUrl) return;

    const baseUrl = process.env.PASSWORD_RESET_BASE_URL?.replace(/\/$/, "");
    if (!baseUrl) throw new Error("PASSWORD_RESET_BASE_URL is required when PASSWORD_RESET_WEBHOOK_URL is configured.");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const resetUrl = `${baseUrl}/issuer?mode=reset&token=${encodeURIComponent(input.token)}`;
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
          resetUrl,
          expiresInMinutes: 30,
          requestedAt: new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error(`Password reset webhook returned HTTP ${response.status}.`);
    } finally {
      clearTimeout(timeout);
    }
  }

export async function registerIssuer(input: { issuerName: string; slug: string; organizationName: string; email: string; displayName: string; password: string; }) {
  assertPassword(input.password);
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  return transaction(async (client) => {
    const organization = await client.query<{ id: string }>("INSERT INTO organizations (name,slug) VALUES ($1,$2) RETURNING id", [input.organizationName.trim(), input.slug.trim().toLowerCase()]);
    const issuer = await client.query<{ id: string }>("INSERT INTO issuers (organization_id,name,slug,contact_email) VALUES ($1,$2,$3,$4) RETURNING id", [organization.rows[0].id, input.issuerName.trim(), input.slug.trim().toLowerCase(), email]);
    const user = await client.query<{ id: string }>("INSERT INTO users (organization_id,email,display_name,password_hash,roles) VALUES ($1,$2,$3,$4,$5) RETURNING id", [organization.rows[0].id, email, input.displayName.trim(), passwordHash, ["issuer-admin", "issuer-operator"]]);
    await client.query("INSERT INTO subscriptions (organization_id,plan_code,status) VALUES ($1,'starter','trialing')", [organization.rows[0].id]);
    return { userId: user.rows[0].id, issuerId: issuer.rows[0].id };
  }).then(async (account) => { await createSession(account.userId, account.issuerId); return account; });
}

export async function loginIssuer(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const result = await query<{ user_id: string; issuer_id: string; email: string; display_name: string; issuer_name: string; password_hash: string | null; status: string }>("SELECT u.id AS user_id, i.id AS issuer_id, u.email, u.display_name, i.name AS issuer_name, u.password_hash, i.status FROM users u JOIN issuers i ON i.organization_id=u.organization_id WHERE u.email=$1 LIMIT 1", [email]);
  const row = result.rows[0];
  if (!row?.password_hash || !(await verifyPassword(password, row.password_hash)) || row.status !== "active") throw new Error("Invalid email or password.");
  await createSession(row.user_id, row.issuer_id);
  return { id: row.user_id, issuerId: row.issuer_id, email: row.email, displayName: row.display_name, issuerName: row.issuer_name } satisfies AuthUser;
}

export async function getCurrentIssuerUser(): Promise<AuthUser | null> {
  const rawToken = cookies().get(SESSION_COOKIE)?.value;
  if (!rawToken) return null;
  const result = await query<AuthUser & { user_id: string; issuer_id: string }>("SELECT u.id AS user_id, i.id AS issuer_id, u.email, u.display_name AS \"displayName\", i.name AS \"issuerName\" FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN issuers i ON i.id=s.issuer_id WHERE s.token_hash=$1 AND s.expires_at > now() AND i.status='active' LIMIT 1", [hashToken(rawToken)]);
  const row = result.rows[0];
  return row ? { id: row.user_id, issuerId: row.issuer_id, email: row.email, displayName: row.displayName, issuerName: row.issuerName } : null;
}

export async function logoutIssuer() {
  const rawToken = cookies().get(SESSION_COOKIE)?.value;
  if (rawToken) await query("DELETE FROM auth_sessions WHERE token_hash=$1", [hashToken(rawToken)]);
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
}

export async function requestPasswordReset(emailInput: string) {
  const email = normalizeEmail(emailInput);
  const result = await query<{ id: string }>("SELECT id FROM users WHERE email=$1 LIMIT 1", [email]);
  if (!result.rows[0]) return { resetToken: null };
  const rawToken = randomBytes(32).toString("base64url");
  await query("INSERT INTO password_reset_tokens (user_id,token_hash,expires_at) VALUES ($1,$2,now() + interval '30 minutes')", [result.rows[0].id, hashToken(rawToken)]);
    await deliverPasswordReset({ email, token: rawToken });
  return { resetToken: process.env.NODE_ENV === "production" ? null : rawToken };
}

export async function resetPassword(rawToken: string, password: string) {
  assertPassword(password);
  const passwordHash = await hashPassword(password);
  return transaction(async (client) => {
    const token = await client.query<{ user_id: string }>("SELECT user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() LIMIT 1", [hashToken(rawToken)]);
    if (!token.rows[0]) throw new Error("Reset link is invalid or expired.");
    await client.query("UPDATE users SET password_hash=$2 WHERE id=$1", [token.rows[0].user_id, passwordHash]);
    await client.query("UPDATE password_reset_tokens SET used_at=now() WHERE token_hash=$1", [hashToken(rawToken)]);
    await client.query("DELETE FROM auth_sessions WHERE user_id=$1", [token.rows[0].user_id]);
  });
}