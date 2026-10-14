type ApiMethod = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";
type ApiHandler = (request: Request) => Response | Promise<Response>;
type ApiHandlers = Partial<Record<ApiMethod, ApiHandler>>;

export async function dispatchApiRequest(
  request: Request,
  routes: Record<string, ApiHandlers>,
  path: string
): Promise<Response> {
  if (!Object.hasOwn(routes, path)) {
    return Response.json({ error: "API route not found." }, { status: 404 });
  }
  const handlers = routes[path];
  const methods = new Set(Object.keys(handlers).filter((method) =>
    ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"].includes(method)));
  methods.add("OPTIONS");
  if (methods.has("GET")) methods.add("HEAD");
  const allow = [...methods].sort().join(", ");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { Allow: allow } });
  }
  if (!methods.has(request.method)) {
    return new Response(null, { status: 405, headers: { Allow: allow } });
  }
  const method = request.method as ApiMethod;
  const handler = method === "HEAD" ? handlers.HEAD ?? handlers.GET : handlers[method];
  if (!handler) {
    return new Response(null, { status: 405, headers: { Allow: allow } });
  }
  const response = await handler(request);
  return method === "HEAD"
    ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers })
    : response;
}
