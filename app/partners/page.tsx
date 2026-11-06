import { ConversionCTA } from "../../components/MarketingPage";
import { publicMetadata } from "../../lib/marketing";

export const metadata = publicMetadata("/partners", "Credential Partner Ecosystem", "Explore prospective collaboration with the Verifiable.sg digital credential platform.");
export default function PartnersPage() {
  return <main className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6 lg:px-8">
    <header className="max-w-3xl"><h1 className="text-4xl font-bold">An ecosystem built around trust</h1>
      <p className="mt-5 text-lg leading-8">We welcome conversations with organizations shaping the future of digital credentials. This is an invitation to collaborate, not a directory of established partnerships.</p></header>
    <section aria-label="Prospective partner communities" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {["Training Providers", "Universities", "Professional Associations", "Corporate Partners", "Credential Programmes"].map(title => <article key={title} className="card"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 text-sm leading-6">Explore how your community could participate in a governed, verifiable credential ecosystem.</p></article>)}
    </section>
    <ConversionCTA />
  </main>;
}
