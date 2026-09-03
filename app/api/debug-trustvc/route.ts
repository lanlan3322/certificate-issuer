export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function inspectLoader(name: string, load: () => Promise<unknown>) {
  try {
    const module = await load();
    return {
      success: true,
      exports: module && typeof module === "object" ? Object.keys(module) : [],
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
  }
}

export async function GET() {
  const nodeModule = (await new Function("modulePath", "return import(modulePath);")(
    "module"
  )) as typeof import("module");
  const { createRequire } = nodeModule;
  const moduleRequire = createRequire(import.meta.url);

  const cjsRoot = await inspectLoader("@trustvc/trustvc createRequire", async () =>
    moduleRequire("@trustvc/trustvc")
  );
  const cjsW3C = await inspectLoader("@trustvc/trustvc/w3c createRequire", async () =>
    moduleRequire("@trustvc/trustvc/w3c")
  );
  const contextCjs = await inspectLoader("@trustvc/w3c-context createRequire", async () =>
    moduleRequire("@trustvc/w3c-context")
  );

  const success = Boolean(cjsW3C.success && contextCjs.success);

  return Response.json(
    {
      success,
      esmImport: {
        success: false,
        message:
          "Skipped in this route because literal ESM imports make Next/Turbopack trace @trustvc/w3c-vc's invalid runtime type export during build.",
      },
      cjsRoot,
      cjsW3C,
      contextCjs,
    },
    { status: success ? 200 : 500 }
  );
}
