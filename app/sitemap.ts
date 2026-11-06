import type { MetadataRoute } from "next";
import { capabilities, resourcePages, solutions } from "../lib/marketing";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/solutions", "/platform", "/pricing", "/partners", "/resources", "/about", "/contact", "/verify",
    ...solutions.map(item => `/solutions/${item.slug}`),
    ...capabilities.map(item => `/platform/${item.slug}`),
    ...resourcePages.map(item => `/resources/${item.slug}`)];
  return paths.map(path => ({ url: `https://verifiable.sg${path === "/" ? "/" : `${path}/`}` }));
}
