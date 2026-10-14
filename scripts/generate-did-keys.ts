// Retain the existing TypeScript entry point without duplicating key generation.
const generator = require("./generate-did-keys.js") as {
  main: () => Promise<void>;
};

generator.main().catch((error: unknown) => {
  console.error(
    "DID key preparation failed:",
    error instanceof Error ? error.message : "Unknown error."
  );
  process.exitCode = 1;
});
