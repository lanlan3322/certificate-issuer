export const getBasePath = () => process.env.NEXT_PUBLIC_BASE_PATH || "";

export const withBasePath = (path: string) => {
  const basePath = getBasePath();
  if (!basePath) return path;
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}`;
};

/**
 * Public verify-page link encoded in certificate QR codes. The page looks the
 * certificate up by its issued ID (the stored external ID) and verifies it.
 */
export const buildVerificationUrl = (origin: string, certificateId?: string) => {
  const url = `${origin}${withBasePath("/verify/")}`;
  const id = certificateId?.trim();
  return id ? `${url}?id=${encodeURIComponent(id)}` : url;
};
