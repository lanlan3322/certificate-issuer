import OrganizationDIDPanel from "../../components/OrganizationDIDPanel";

export default function OrganizationDIDPage() {
  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
    <p className="text-sm font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Organization identity</p>
    <h1 className="mt-2 text-3xl font-bold">Managed DID</h1>
    <p className="mb-8 mt-3 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
      One managed identity for your organization, with a verification method for each issuer key.
      Public verification material is hosted by Verifiable.sg; private keys remain protected.
    </p>
    <OrganizationDIDPanel />
  </main>;
}
