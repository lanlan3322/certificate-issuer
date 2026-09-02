import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export class SupabaseConfigurationError extends Error {}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new SupabaseConfigurationError(`${name} is required for Supabase operations.`);
  return value;
}

/**
 * Request-scoped client that reads and refreshes the GoTrue session cookies.
 * Use this for anything acting on behalf of the signed-in user.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // proxy.ts performs the refresh write instead.
          }
        },
      },
    }
  );
}

let adminClient: SupabaseClient | undefined;

/**
 * Service-role client — bypasses row level security. Only for operations that
 * legitimately require elevated server-side access. Never import from a client
 * component and never return its results without an authorization check.
 */
export function getSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return adminClient;
}
