import Link from "next/link";
import { getCurrentIssuerUser } from "../../lib/auth";
import { hasPermission } from "../../lib/permissions";

const areas = [
  ["/organization-did#managed-did", "Managed DID", "Review the organization identity hosted by Verifiable.sg. Historical methods remain available for earlier credentials."],
  ["/organization-did#self-managed-did", "Self-Managed DID", "Use did:web on your domain. Generate deployment files and validate availability before switching new issuance."],
  ["/organization-did#verification-methods", "Verification Methods", "Connect each issuer's public key and key version to its published verification method."],
  ["/identity-trust#issuer-keys", "Issuer Keys", "Understand key custody and open the issuer directory to select an issuer for key management."],
  ["/organization-did#did-documents", "DID Documents", "Inspect and download public organization DID documents. Private keys are never included."],
  ["/document-stores", "Document Stores", "Configure approved organization-owned anchoring contracts while preserving historical store references."],
];

export default async function IdentityTrustPage() {
  const user = await getCurrentIssuerUser();
  if (!hasPermission(user, "members.manage")) return <main className="p-6"><h1 className="text-3xl font-bold">Identity & Trust</h1><p role="alert" className="mt-4">Organization administrator access is required. Ask your administrator about organization identity configuration.</p></main>;
  return <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
    <header><p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">Digital trust infrastructure</p><h1 className="mt-2 text-3xl font-bold">Identity & Trust</h1>
      <p className="mt-4 max-w-3xl leading-7 text-slate-600 dark:text-slate-300">Your organization owns its credential identity. Govern issuer keys, publish verification evidence and manage blockchain anchoring through connected workflows.</p></header>
    <section aria-label="Trust infrastructure" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {areas.map(([href, title, description]) => <Link key={title} href={href} prefetch={false} className="card transition-colors hover:border-cyan-600"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 text-sm leading-7">{description}</p></Link>)}
    </section>
    <section id="issuer-keys" className="card">
      <h2 className="text-xl font-semibold">Issuer key governance</h2>
      <p className="mt-3 max-w-3xl leading-7">Each issuer has its own encrypted signing key and tracked key versions. Rotation changes new issuance; historical public methods remain available for verification. Self-managed DID means customer-controlled hosting, not private-key custody.</p>
      <Link href="/admin#issuer-directory-heading" prefetch={false} className="btn-primary mt-5">Select issuer & manage keys</Link>
    </section>
    <p className="text-sm text-slate-500">Changing hosting or anchoring affects new issuance only. Keep historical DID documents and Document Stores accessible for existing credentials.</p>
  </main>;
}
