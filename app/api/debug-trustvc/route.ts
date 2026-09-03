export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const nodeModule = (await new Function("modulePath", "return import(modulePath);")(
    "module"
  )) as typeof import("module");
  const { createRequire } = nodeModule;
  const moduleRequire = createRequire(import.meta.url);
  const mod = moduleRequire("@trustvc/trustvc") as Record<string, unknown>;

  return Response.json({
    exports: Object.keys(mod),
  });
}
