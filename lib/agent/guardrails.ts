const SENSITIVE_PATTERNS = [
  /private\s*key/i,
  /secret\s*key/i,
  /seed\s*phrase/i,
  /mnemonic/i,
  /api[_ -]?key/i,
  /password/i,
];

export function guardAgentInput(input: string): string | null {
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(input))) {
    return "For your security, never share private keys, seed phrases, passwords, or API keys. Use a secure server-side signing service for DID keys.";
  }
  return null;
}

export function guardAgentOutput(output: string): string {
  return output.replace(/(?:sk-|AIza)[A-Za-z0-9_-]{16,}/g, "[redacted]");
}