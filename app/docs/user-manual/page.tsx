import Link from "next/link";

export default function UserManualPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-slate-800 dark:text-slate-200 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700 dark:text-cyan-300">Documentation</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">User Manual</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">Preview templates, issue credentials, and check their authenticity.</p>
      </header>

      <nav aria-label="User manual sections" className="mb-8 flex flex-wrap gap-3 text-sm font-semibold text-cyan-800 dark:text-cyan-300">
        <a href="#getting-started" className="underline underline-offset-4">Getting started</a>
        <a href="#templates" className="underline underline-offset-4">Templates</a>
        <a href="#issuance" className="underline underline-offset-4">Issuance</a>
        <a href="#dashboard" className="underline underline-offset-4">Dashboard</a>
        <a href="#profile" className="underline underline-offset-4">My Profile</a>
      </nav>

      <div className="space-y-6 text-sm leading-7">
        <section id="getting-started" aria-labelledby="getting-started-heading" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 id="getting-started-heading" className="text-xl font-bold">1. Your credential workflow</h2>
          <figure className="mt-5">
            <figcaption className="mb-3 text-slate-600 dark:text-slate-300">Follow these steps from template selection to verification.</figcaption>
            <ol className="grid gap-3 sm:grid-cols-4">
              {[
                ["Preview", "Branding: choose a saved template."],
                ["Issue", "Issue: enter recipient details and sign."],
                ["Share", "Download and deliver the credential."],
                ["Verify", "Check signature, status, and blockchain evidence."],
              ].map(([title, detail], index) => (
                <li key={title} className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-900 dark:bg-cyan-950">
                  <span className="text-xs font-bold uppercase text-cyan-800 dark:text-cyan-300">Step {index + 1}</span>
                  <h3 className="mt-1 font-bold">{title}</h3>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">{detail}</p>
                  {index < 3 && <span aria-hidden="true" className="mt-2 block font-bold text-cyan-700 dark:text-cyan-300">Next &rarr;</span>}
                </li>
              ))}
            </ol>
          </figure>
          <ul className="mt-5 list-disc space-y-2 pl-5">
            <li><strong>Overview</strong> always shows the public introduction, logged in or not.</li>
            <li>Sign in, then open <strong>eServices → Dashboard</strong> to manage your issued certificates.</li>
            <li>Use <strong>Verify</strong> to check a credential before sending or accepting it.</li>
          </ul>
        </section>

        <section id="templates" aria-labelledby="templates-heading" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 id="templates-heading" className="text-xl font-bold">2. Choose and preview a template</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li><strong>Branding:</strong> select a template from the dropdown. The first is selected automatically.</li>
            <li>The preview uses sample data. It does not save changes, issue certificates, or use signing keys.</li>
            <li><strong>Template Style</strong> lists active saved templates owned by issuers in your organization, for both single and batch issuance.</li>
            <li><strong>Platform admins</strong> can select active saved templates across organizations.</li>
            <li>If no templates appear, ask an administrator to save one under an issuer in your organization. Issuance stays disabled until one is available.</li>
          </ul>
          <aside className="mt-5 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            <h3 className="font-bold">Sharing a template does not share an identity</h3>
            <p className="mt-1">Shared templates reuse the visual style, not the owner&apos;s signing identity, Document Store, or certificate permissions. Your own template&apos;s signing-profile mapping still applies; shared templates use the existing default signing configuration. Certificates remain owned by your logged-in issuer.</p>
          </aside>
          <details className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <summary className="cursor-pointer font-semibold">Supported layouts and older certificates</summary>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Supported layout slugs: <code>classic</code>, <code>modern</code>, <code>minimal</code>, and <code>fta</code>. Other slugs use the classic layout.</li>
              <li>Saved template database IDs track ownership; the credential&apos;s style controls its preview, including FTA.</li>
              <li>Legacy stored style names remain supported. Existing issued certificates and verification are unchanged.</li>
              <li>New issuance must select an available saved template, not an unsaved built-in style.</li>
            </ul>
          </details>
        </section>

        <section id="issuance" aria-labelledby="issuance-heading" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 id="issuance-heading" className="text-xl font-bold">3. Issue a certificate</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5">
            <li>Open <strong>Issue</strong> and choose single or batch issuance.</li>
            <li>Select an available template and enter or upload recipient details.</li>
            <li>Review validity dates and select the issuance methods.</li>
            <li>Issue the credential, review the result, and download it for delivery.</li>
          </ol>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <h3 className="font-bold">DID signing checklist</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>The administrator must configure a valid signing identity.</li>
                <li>Review the resulting proof before sharing.</li>
                <li>Do not share private keys or authentication tokens.</li>
              </ul>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800">
              <h3 className="font-bold">Ethereum checklist</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Connect MetaMask and switch to Sepolia.</li>
                <li>Ensure the wallet has enough ETH for the transaction.</li>
                <li>Approve the transaction and review its result.</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="dashboard" aria-labelledby="dashboard-heading" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 id="dashboard-heading" className="text-xl font-bold">4. Read dashboard verification results</h2>
          <p className="mt-3">Checks run automatically, one certificate at a time. Verification evidence and certificate lifecycle status are separate.</p>
          <p className="mt-3">The Dashboard and signed-in Issuer Portal share the same certificate table: verification columns, row or View-button preview, Revoke action, and rightmost Send action. Revocation updates the displayed status and removes the Send action for that certificate.</p>
          <p className="mt-3">For an ISSUED certificate, choose <strong>Send</strong> in the rightmost column on either certificate table. Review the recorded recipient and confirm to email the signed .json file. Cancel sends nothing. Recipient addresses cannot be edited in this dialog. Provider acceptance does not confirm inbox delivery; check with the recipient before deliberately sending another copy.</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <dt className="font-bold">Blockchain verified: Yes</dt>
              <dd className="mt-1">The verifier confirmed the certificate&apos;s blockchain registration.</dd>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <dt className="font-bold">DID verified: Yes</dt>
              <dd className="mt-1">The signature and the issuer DID&apos;s authorization were verified.</dd>
            </div>
          </dl>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li><strong>Checking:</strong> verification is pending or in progress.</li>
            <li><strong>No / Not verified:</strong> the check did not establish successful verification.</li>
            <li><strong>Unavailable:</strong> verification could not be completed; do not treat it as success.</li>
            <li><strong>Not required / Not applicable:</strong> that verification method does not apply to the result.</li>
            <li><strong>Rate limited:</strong> remaining checks have stopped. Wait for the limit to reset before reloading.</li>
            <li>Hover over a result for the verifier&apos;s message. Always also review the certificate&apos;s issued, revoked, or expired status.</li>
          </ul>
        </section>

        <section id="profile" aria-labelledby="profile-heading" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 id="profile-heading" className="text-xl font-bold">5. Manage your profile</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>Choose <strong>My Profile</strong> beside <strong>Issue certificate</strong> on the dashboard.</li>
            <li>You can edit your <strong>display name</strong>.</li>
            <li>Email, roles, and organization/issuer assignments are read-only.</li>
            <li><strong>Reset password</strong> sends instructions to your registered email.</li>
            <li>The <strong>Organization</strong> menu in eServices is visible only to platform admins.</li>
          </ul>
        </section>
      </div>

      <footer className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
        <Link href="/" className="rounded-lg bg-slate-900 px-4 py-3 text-white dark:bg-slate-700">Back to overview</Link>
        <Link href="/verify" className="rounded-lg border border-slate-300 px-4 py-3 dark:border-slate-600">Open verify</Link>
        <Link href="/docs/admin-manual" className="rounded-lg border border-slate-300 px-4 py-3 dark:border-slate-600">Admin manual</Link>
      </footer>
    </main>
  );
}
