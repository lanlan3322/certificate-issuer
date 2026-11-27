import Link from "next/link";
import { ArrowRight, Award, BookOpen, ShieldCheck } from "lucide-react";
import { publicMetadata } from "../../lib/marketing";

export const metadata = publicMetadata("/wallet", "Professional Credential Passport",
  "Explore the planned professional credential wallet from Verifiable.sg.");

export default function WalletPage() {
  return <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-10">
      <p className="text-sm font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Professional Credential Passport</p>
      <h1 className="mt-3 max-w-3xl text-3xl font-bold sm:text-4xl">Your professional journey, in one place</h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-600 dark:text-slate-300">Manage all your professional credentials in one secure digital wallet.</p>
      <p className="mt-4 max-w-2xl rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
        The wallet uses your verified email to find credentials. Membership, CPD and professional standing data are not yet available.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/wallet/access" className="btn-primary">Open your wallet <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
        <Link href="/verify" className="btn-secondary">Verify a credential</Link>
      </div>
    </section>
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      {[
        { title: "Credentials and certifications", description: "A planned home for your professional achievements.", icon: Award },
        { title: "Lifelong learning", description: "A planned view of memberships and continuing professional development.", icon: BookOpen },
        { title: "Verification", description: "Check credentials using the existing public verification service.", icon: ShieldCheck },
      ].map(({ title, description, icon: Icon }) => <section key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <Icon className="h-5 w-5 text-violet-700 dark:text-violet-300" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
      </section>)}
    </div>
  </main>;
}
