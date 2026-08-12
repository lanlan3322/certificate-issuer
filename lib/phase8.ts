export interface ApiRouteSpec {
  name: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  version: string;
  scopes: string[];
}

export interface ApiAuthContext {
  route: ApiRouteSpec;
  tokenScopes?: string[];
}

export function createApiRouteSpec(input: {
  name: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  scopes: string[];
}): ApiRouteSpec {
  const normalizedPath = input.path.trim();
  const version = normalizedPath.includes("/v")
    ? normalizedPath.split("/v")[1].split("/")[0] || "v1"
    : "v1";

  return {
    name: input.name,
    method: input.method,
    path: normalizedPath,
    version: `v${version.replace(/^v/, "")}`,
    scopes: input.scopes,
  };
}

export function authorizeApiRequest(context: ApiAuthContext): boolean {
  const tokenScopes = context.tokenScopes ?? [];
  return context.route.scopes.every((scope) => tokenScopes.includes(scope));
}
