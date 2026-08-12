function createApiRouteSpec(input) {
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

function authorizeApiRequest(context) {
  const tokenScopes = context.tokenScopes ?? [];
  return context.route.scopes.every((scope) => tokenScopes.includes(scope));
}

module.exports = {
  createApiRouteSpec,
  authorizeApiRequest,
};
