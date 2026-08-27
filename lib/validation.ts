export function validateEnvironment(): string[] {
  const requiredVars = [
    "NEXT_PUBLIC_DID_KEY_ID",
    "NEXT_PUBLIC_DID_CONTROLLER", 
    "NEXT_PUBLIC_DID_PUBLIC_KEY_MULTIBASE",
    // Server-only: never expose the signing key through a NEXT_PUBLIC_ variable.
    "DID_PRIVATE_KEY_MULTIBASE",
    "NEXT_PUBLIC_DOCUMENT_STORE_ADDRESS"
  ];

  const missing = requiredVars.filter(
    varName => !process.env[varName as keyof NodeJS.ProcessEnv]
  );

  return missing;
}

export function isEnvironmentValid(): boolean {
  return validateEnvironment().length === 0;
}