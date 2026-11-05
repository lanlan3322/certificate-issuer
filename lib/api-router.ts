type ApiMethod = "GET" | "HEAD" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";
type ApiHandler = (request: Request, params?: Record<string, string>) => Response | Promise<Response>;
type ApiHandlers = Partial<Record<ApiMethod, ApiHandler>>;

export async function dispatchApiRequest(
  request: Request,
  routes: Record<string, ApiHandlers>,
  path: string
): Promise<Response> {
  const routeKey = Object.hasOwn(routes, path) ? path : Object.keys(routes).find((candidate) => {
    const parts = candidate.split("/");
    const actual = path.split("/");
    return parts.length === actual.length && parts.every((part, index) =>
      /^\[[^\]]+\]$/.test(part) ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actual[index]) : part === actual[index]);
  });
  if (routeKey === undefined) {
    return Response.json({ error: "API route not found." }, { status: 404 });
  }
  const handlers = routes[routeKey];
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
