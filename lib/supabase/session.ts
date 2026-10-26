import type { User } from "@supabase/supabase-js";

type AuthLikeError = { code?: unknown; status?: unknown; message?: unknown; name?: unknown } | null | undefined;

type GetUserClient = {
  auth: { getUser: () => Promise<{ data: { user: User | null } | null; error: AuthLikeError }> };
};

export function isStaleSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "refresh_token_not_found" || code === "refresh_token_already_used" || code === "session_not_found") {
    return true;
  }
  return typeof message === "string" && /invalid refresh token|refresh token not found/i.test(message);
}

/**
 * Resolves the signed-in user, treating stale/missing sessions and any auth
 * lookup failure as logged out so page rendering never throws.
 */
export async function getUserSafely(client: GetUserClient): Promise<{ user: User | null; staleSession: boolean }> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error) return { user: null, staleSession: isStaleSessionError(error) };
    return { user: data?.user ?? null, staleSession: false };
  } catch (error) {
    return { user: null, staleSession: isStaleSessionError(error) };
  }
}

export function isSupabaseAuthCookie(name: string) {
  return /^sb-.+-auth-token(?:\.\d+)?$/.test(name);
}
