// Credentials are written as JSON text into the JSONB column, so stored rows
// hold a JSON string scalar; normalise to the credential object on read.
export const parseStoredCredential = (value: unknown): Record<string, unknown> => {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};
