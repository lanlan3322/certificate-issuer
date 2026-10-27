import Link from "next/link";

export default function AdminManualPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-slate-800 dark:text-slate-200 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700 dark:text-cyan-300">Documentation</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">Admin Manual</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">Set up issuers, configure account emails, and review certificate operations.</p>
      </header>

      <nav aria-label="Admin manual sections" className="mb-8 flex flex-wrap gap-3 text-sm font-semibold text-cyan-800 dark:text-cyan-300">
        <a href="#organizations" className="underline underline-offset-4">Organizations</a>
        <a href="#invitations" className="underline underline-offset-4">Issuer invitations</a>
        <a href="#recovery" className="underline underline-offset-4">Password recovery</a>
        <a href="#operations" className="underline underline-offset-4">Operations</a>
      </nav>

      <div className="space-y-6 text-sm leading-7">
        <section id="organizations" aria-labelledby="organizations-heading" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 id="organizations-heading" className="text-xl font-bold">1. Organization and issuer structure</h2>
          <figure className="mt-5">
            <figcaption className="mb-3 text-slate-600 dark:text-slate-300">Templates are linked to an organization through their owning issuer.</figcaption>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                ["Organization", "Groups issuers and determines template availability."],
                ["Issuer", "Owns saved templates and issued certificate activity."],
                ["Saved template", "Supplies the selected certificate style."],
              ].map(([title, detail], index) => (
                <li key={title} className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-900 dark:bg-cyan-950">
                  <span className="text-xs font-bold uppercase text-cyan-800 dark:text-cyan-300">Level {index + 1}</span>
                  <h3 className="mt-1 font-bold">{title}</h3>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">{detail}</p>
                  {index < 2 && <span aria-hidden="true" className="mt-2 block font-bold text-cyan-700 dark:text-cyan-300">Contains &rarr;</span>}
                </li>
              ))}
            </ol>
          </figure>
          <ul className="mt-5 list-disc space-y-2 pl-5">
            <li><strong>Issuer Management</strong> loads available issuers and active organizations when opened.</li>
            <li>Switch to <strong>Organization</strong> to filter issuers by organization. Switching back preserves the full list.</li>
            <li>The organization directory requires <strong>platform-admin</strong>. Loading and permission errors appear on the page.</li>
            <li>Review issuer records, activation state, and template setup before approving issuance.</li>
          </ul>
        </section>

        <section id="invitations" aria-labelledby="invitations-heading" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 id="invitations-heading" className="text-xl font-bold">2. Invite a new issuer user</h2>
          <h3 className="mt-4 font-bold">Before you start</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>Apply migration <code className="break-all">012_issuer_user_invitations.sql</code> before deploying the invitation flow.</li>
            <li>Configure Supabase SMTP for invitation delivery.</li>
            <li>Allow the deployed <code>/issuer/?mode=reset</code> redirect URL in Supabase Auth.</li>
          </ul>
          <figure className="mt-5">
            <figcaption className="mb-3 font-semibold">Invitation flow</figcaption>
            <ol className="grid gap-3 sm:grid-cols-4">
              {[
                ["Create issuer", "Choose the organization and contact email."],
                ["Choose role", "issuer-operator (default) or issuer-admin."],
                ["Send invitation", "Supabase emails the contact address."],
                ["Set password", "The recipient opens the link and sets a password."],
              ].map(([title, detail], index) => (
                <li key={title} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
                  <span className="text-xs font-bold text-cyan-800 dark:text-cyan-300">STEP {index + 1}</span>
                  <h3 className="mt-1 font-bold">{title}</h3>
                  <p className="mt-1 break-words">{detail}</p>
                  {index < 3 && <span aria-hidden="true" className="mt-2 block">Next &rarr;</span>}
                </li>
              ))}
            </ol>
          </figure>
          <aside className="mt-5 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            <strong>Existing accounts are not reassigned or promoted.</strong> The selected role is for the new login user, not a role on the issuer record.
          </aside>
          <details className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <summary className="cursor-pointer font-semibold">Invitation email template</summary>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>The default invitation email must use Supabase&apos;s <code>{"{{ .ConfirmationURL }}"}</code>.</li>
              <li>A custom token-hash template can use:</li>
            </ul>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800"><code>{"{{ .SiteURL }}/auth/recovery/?token_hash={{ .TokenHash }}&type=invite"}</code></pre>
          </details>
        </section>

        <section id="recovery" aria-labelledby="recovery-heading" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 id="recovery-heading" className="text-xl font-bold">3. Configure password recovery</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5">
            <li>Open Supabase Auth URL Configuration.</li>
            <li>Allow <code className="break-all">https://verifiable.sg/issuer/?mode=reset</code>, or the corresponding deployed hostname.</li>
            <li>Keep the Site URL and redirect allow-list consistent, including <code>www</code> if used.</li>
            <li>Use <code>{"{{ .ConfirmationURL }}"}</code> in the default Reset password email, or the custom link below.</li>
            <li>After changing settings, request a fresh reset email and test the complete flow.</li>
          </ol>
          <h3 className="mt-5 font-bold">Custom reset email link</h3>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800"><code>{"{{ .SiteURL }}/auth/recovery/?token_hash={{ .TokenHash }}&type=recovery"}</code></pre>
          <p className="mt-2 text-slate-600 dark:text-slate-300">For an HTML email&apos;s link attribute, encode the separator as <code>&amp;amp;</code>.</p>
          <figure className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <figcaption className="font-semibold">Recovery link journey</figcaption>
            <ol className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <li className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">1. Open email link <span aria-hidden="true">&rarr;</span></li>
              <li className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">2. Verify recovery token <span aria-hidden="true">&rarr;</span></li>
              <li className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">3. Set new password</li>
            </ol>
          </figure>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>Point custom links to <code>/auth/recovery/</code>, not Overview.</li>
            <li>Older Overview links with <code>token_hash</code> and <code>type=recovery</code> are forwarded for compatibility. Existing custom recovery links remain supported.</li>
            <li>Password setup opens even if the recipient is already signed in.</li>
          </ul>
          <div className="mt-5 rounded-xl bg-cyan-50 p-4 dark:bg-cyan-950">
            <h3 className="font-bold">Password requirements</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>At least 10 characters.</li>
              <li>At least one uppercase and one lowercase letter.</li>
              <li>At least one number.</li>
              <li>At least one special character; whitespace does not count.</li>
            </ul>
          </div>
        </section>

        <section id="operations" aria-labelledby="operations-heading" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 id="operations-heading" className="text-xl font-bold">4. Operational review checklist</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li><strong>Identity:</strong> confirm the issuer workspace and DID signing configuration are valid before publishing.</li>
            <li><strong>Templates:</strong> confirm an active saved template is available to the issuer&apos;s organization.</li>
            <li><strong>Wallet:</strong> check the selected network, funds, and Document Store permissions when Ethereum is used.</li>
            <li><strong>Verification:</strong> inspect signature, issuer authorization, and applicable blockchain checks; unavailable is not verified.</li>
            <li><strong>Lifecycle:</strong> review revocation and status checks alongside verification evidence.</li>
            <li><strong>Audit:</strong> review audit activity to support governance across issuers.</li>
            <li><strong>Secrets:</strong> never share private signing keys, password-reset links, or authentication tokens in troubleshooting reports.</li>
          </ul>
        </section>
      </div>

      <footer className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
        <Link href="/" className="rounded-lg bg-slate-900 px-4 py-3 text-white dark:bg-slate-700">Back to overview</Link>
        <Link href="/admin" className="rounded-lg border border-slate-300 px-4 py-3 dark:border-slate-600">Open admin</Link>
        <Link href="/docs/user-manual" className="rounded-lg border border-slate-300 px-4 py-3 dark:border-slate-600">User manual</Link>
      </footer>
    </main>
  );
}
