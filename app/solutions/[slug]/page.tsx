import { notFound } from "next/navigation";
import { MarketingDetail } from "../../../components/MarketingPage";
import { publicMetadata, solutions } from "../../../lib/marketing";

export const dynamicParams = false;
export function generateStaticParams() { return solutions.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = solutions.find(item => item.slug === slug);
  if (!entry) notFound();
  return publicMetadata(`/solutions/${slug}`, entry.title, entry.description);
}
export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = solutions.find(item => item.slug === slug);
  if (!entry) notFound();
  return <MarketingDetail entry={entry} base="/solutions" category="Solutions" />;
}
