import { ConversionCTA } from "../../components/MarketingPage";
import { publicMetadata } from "../../lib/marketing";

export const metadata = publicMetadata("/about", "About Verifiable.sg", "Verifiable.sg is an independent Credential-as-a-Service platform for organizations and their communities.");
export default function AboutPage() {
  return <main className="mx-auto max-w-5xl space-y-10 px-4 py-12 sm:px-6">
    <header><p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">Independent digital credential platform</p><h1 className="mt-3 text-4xl font-bold">About Verifiable.sg</h1>
      <p className="mt-5 text-lg leading-8">Verifiable.sg is an independent Credential-as-a-Service platform for organizations that need trusted identity, accountable issuance and accessible verification.</p></header>
    <section className="card"><h2 className="text-2xl font-semibold">Our mission</h2><p className="mt-4 leading-7">Help organizations issue, manage, revoke and verify trusted digital credentials under their own identity and brand.</p></section>
    <section className="card"><h2 className="text-2xl font-semibold">Our vision</h2><p className="mt-4 leading-7">An enterprise credential ecosystem where professional certifications, memberships and learning achievements carry verifiable evidence beyond the original issuing system.</p></section>
    <ConversionCTA />
  </main>;
}
