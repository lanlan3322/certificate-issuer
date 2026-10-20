const INTERNAL_ORIGIN = "https://internal.invalid";

export function safeInternalPath(value: string | null | undefined, fallback = "/issuer/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") ||
      /%5c/i.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }
  try {
    const destination = new URL(value, INTERNAL_ORIGIN);
    if (destination.origin !== INTERNAL_ORIGIN) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}
