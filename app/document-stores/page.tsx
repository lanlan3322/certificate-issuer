import OrganizationDocumentStores from "../../components/OrganizationDocumentStores";
import Link from "next/link";

export default function DocumentStoresPage() {
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
    <Link href="/identity-trust" className="inline-flex min-h-11 items-center text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300">Identity & Trust</Link>
    <header>
      <p className="text-sm font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Blockchain infrastructure</p>
      <h1 className="mt-2 text-3xl font-bold">Document Store Management</h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Configure organization-owned anchoring contracts without changing historical credential stores.</p>
    </header>
    <OrganizationDocumentStores />
  </main>;
}
