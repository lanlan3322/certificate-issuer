export const getBasePath = () => process.env.NEXT_PUBLIC_BASE_PATH || "";

export const withBasePath = (path: string) => {
  const basePath = getBasePath();
  if (!basePath) return path;
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
};
