import { ArrowRight, CheckCircle, FileText, Shield, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <section className="bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_35%),linear-gradient(135deg,#0f172a_0%,#111827_18%,#0f172a_100%)] text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
          <div className="grid items-center gap-8 sm:gap-10 md:gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                <Shield className="h-3.5 w-3.5" />
                Verifiable.sg · Credential-as-a-Service
              </div>
              <h1 className="max-w-xl text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                Branded digital credentials.<br />One connected service.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-200 sm:text-base md:text-lg">
                Verifiable.sg helps organizations issue, manage, revoke, and verify digital
                credentials under their own brand, with issuer identity and verification tools
                in one service.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <a
                  href="/insurance"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 min-h-[48px]"
                >
                  Issue a credential
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </a>
                <a
                  href="/verify"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  Verify a credential
                </a>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300 sm:text-base">
                <div><span className="font-semibold text-white">W3C VC</span> data model</div>
                <div><span className="font-semibold text-white">DID-based</span> issuer identity</div>
                <div><span className="font-semibold text-white">Multi-issuer</span> support</div>
              </div>
            </div>
            <aside aria-labelledby="workflow-heading" className="rounded-2xl border border-white/15 bg-white/5 p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">From issuance to verification</p>
              <h2 id="workflow-heading" className="mt-2 text-xl font-bold text-white">Your credential workflow</h2>
              <ol className="mt-5 space-y-4">
                {[
                  ["01", "Create & sign", "Choose an organization template and issue a signed credential."],
                  ["02", "Share & deliver", "Download a credential or email it to its recipient."],
                  ["03", "Verify & manage", "Check credential authenticity and manage its status."],
                ].map(([step, title, description]) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-300/10 text-xs font-bold text-cyan-200">{step}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-300">{description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
            
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:space-y-10 sm:px-6 sm:py-10 lg:px-8">
        <section aria-labelledby="standards-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
          <h2 id="standards-heading" className="text-lg font-bold text-slate-900 dark:text-slate-100">Built on open standards</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-3">
            {[
              { title: "W3C Verifiable Credentials", description: "Issue credentials using the W3C Verifiable Credentials data model.", icon: ShieldCheck },
              { title: "Optional Ethereum anchoring", description: "Anchor document hashes on Ethereum to support integrity checks.", icon: CheckCircle },
              { title: "TradeTrust compatibility", description: "Support OpenAttestation-compatible credential workflows and verification.", icon: FileText },
            ].map(({ title, description, icon: Icon }) => (
              <div key={title} className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
                <div><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3><p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{description}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-400 sm:text-sm">FAQ</p>
          <h2 id="faq-heading" className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-100">Common questions</h2>
          <div className="mt-4 grid gap-3 sm:gap-4 md:grid-cols-2">
            {[
              ["What is Credential-as-a-Service?", "Verifiable.sg provides the infrastructure for organizations to issue, manage, revoke, and verify branded digital credentials."],
              ["Can organizations manage multiple issuers?", "Yes. Organization administrators can manage issuer accounts and access to saved templates."],
              ["How can recipients access credentials?", "Issuers can download credential files, share PDFs, or email signed credential JSON. Recipients can check credentials through the public verification service."],
              ["Are wallet integrations available?", "Wallet import and mobile wallet delivery are not currently available. Credentials can be downloaded, emailed, and independently checked through the verification service."],
            ].map(([question, answer]) => (
              <div key={question} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-600 dark:bg-slate-700 sm:p-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 sm:text-base">{question}</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:text-sm">{answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl bg-slate-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:bg-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-white">Need an institutional workflow?</h2>
            <p className="mt-1 text-sm text-slate-300">Explore enterprise controls and multi-issuer operations.</p>
          </div>
          <a href="/enterprise" className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">View Plans<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></a>
        </section>

      </div>
    </div>
  );
}
