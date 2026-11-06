import BillingDashboard from "../../components/BillingDashboard";

export default function BillingPage() {
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
    <h1 className="mb-3 text-3xl font-bold">Billing & usage</h1>
    <p className="mb-8 text-sm text-slate-500">Manage your organization subscription and monitor credential capacity.</p>
    <BillingDashboard />
  </main>;
}
