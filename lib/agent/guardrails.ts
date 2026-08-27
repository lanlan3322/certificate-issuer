const SENSITIVE_PATTERNS = [
  /private\s*key/i,
  /secret\s*key/i,
  /seed\s*phrase/i,
  /mnemonic/i,
  /api[_ -]?key/i,
  /password/i,
];

const REDACTIONS: RegExp[] = [
  // OpenAI / Google style API keys
  /(?:sk-|AIza)[A-Za-z0-9_-]{16,}/g,
  // Multibase base58btc keys — the DID signing key format used by this app
  /\bz[1-9A-HJ-NP-Za-km-z]{40,}\b/g,
  // Ethereum private keys
  /\b0x[a-fA-F0-9]{64}\b/g,
  // Bearer tokens and JWTs
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  // Postgres connection strings
  /postgres(?:ql)?:\/\/[^\s"']+/gi,
];

export function guardAgentInput(input: string): string | null {
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(input))) {
    return "For your security, never share private keys, seed phrases, passwords, or API keys. Use a secure server-side signing service for DID keys.";
  }
  return null;
}

export function guardAgentOutput(output: string): string {
  return REDACTIONS.reduce((text, pattern) => text.replace(pattern, "[redacted]"), output);
}
