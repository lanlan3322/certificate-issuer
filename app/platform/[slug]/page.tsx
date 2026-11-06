import { notFound } from "next/navigation";
import { MarketingDetail } from "../../../components/MarketingPage";
import { capabilities, publicMetadata } from "../../../lib/marketing";

export const dynamicParams = false;
export function generateStaticParams() { return capabilities.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = capabilities.find(item => item.slug === slug);
  if (!entry) notFound();
  return publicMetadata(`/platform/${slug}`, entry.title, entry.description);
}
export default async function CapabilityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = capabilities.find(item => item.slug === slug);
  if (!entry) notFound();
  return <MarketingDetail entry={entry} base="/platform" category="Platform" />;
}
