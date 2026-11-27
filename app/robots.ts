import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [
      "/api/", "/issuer/", "/dashboard/", "/credentials/", "/platform/dashboard/",
      "/organizations/", "/admin/", "/identity-trust/", "/organization-did/",
      "/document-stores/", "/billing/", "/audit/", "/profile/", "/insurance/",
      "/branding/", "/templates/", "/revocation/", "/wallet/access/", "/wallet/dashboard/", "/renderer/",
      "/verification/", "/bulk/", "/did/",
    ] },
    sitemap: "https://verifiable.sg/sitemap.xml",
  };
}
