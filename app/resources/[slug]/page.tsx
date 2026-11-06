import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversionCTA } from "../../../components/MarketingPage";
import { publicMetadata, resourcePages } from "../../../lib/marketing";

export const dynamicParams = false;
export function generateStaticParams() { return resourcePages.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = resourcePages.find(item => item.slug === slug);
  if (!entry) notFound();
  return publicMetadata(`/resources/${slug}`, entry.title, entry.description);
}
export default async function ResourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = resourcePages.find(item => item.slug === slug);
  if (!entry) notFound();
  return <main className="mx-auto max-w-5xl space-y-8 px-4 py-12 sm:px-6">
    <Link href="/resources" className="text-cyan-700 hover:underline dark:text-cyan-300">Resources</Link>
    <header><h1 className="text-4xl font-bold">{entry.title}</h1><p className="mt-4 leading-7">{entry.description}</p></header>
    {entry.items.map(([title, text]) => <section key={title} className="card"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 leading-7">{text}</p></section>)}
    {slug === "documentation" && <nav aria-label="Documentation" className="flex flex-wrap gap-3"><Link className="btn-secondary" href="/docs/user-manual">User guide</Link><Link className="btn-secondary" href="/docs/admin-manual">Admin guide</Link></nav>}
    {slug === "blog" && <Link className="btn-secondary" href="/release-notes">Product release notes</Link>}
    <ConversionCTA />
  </main>;
}
