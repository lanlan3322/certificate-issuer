import Link from "next/link";
import { ManualFlow, ManualReference } from "../../../components/ManualIllustrations";

const sectionStyle = "scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6";
const noteStyle = "mt-4 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950 dark:text-amber-100";

export default function UserManualPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-slate-800 dark:text-slate-200 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700 dark:text-cyan-300">Documentation</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">User Manual</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">Choose a template. Issue a credential. Share and verify.</p>
      </header>
      <nav aria-label="User manual sections" className="mb-8 flex flex-wrap gap-2 text-sm font-semibold">
        {[["getting-started", "Start here"], ["templates", "Templates"], ["issuance", "Issue"], ["dashboard", "Manage & share"], ["profile", "My Profile"]].map(([id, title]) => (
          <a key={id} href={`#${id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-cyan-800 hover:bg-cyan-50 dark:border-slate-600 dark:text-cyan-300 dark:hover:bg-slate-800">{title}</a>
        ))}
      </nav>
      <div className="space-y-6 text-sm leading-6">
        <section id="getting-started" aria-labelledby="getting-started-heading" className={sectionStyle}>
          <h2 id="getting-started-heading" className="text-xl font-bold">1. Start here</h2>
          <ManualFlow label="Your credential journey" steps={[
            ["Preview", "Branding: choose a saved template and check its sample layout."],
            ["Issue", "Enter recipient details, review dates, then sign."],
            ["Share", "Download the credential or email its signed JSON."],
            ["Verify", "Check signature, status and any blockchain evidence."],
          ]} />
          <p className="mt-4"><strong>Sign in → eServices → Dashboard.</strong> Overview stays public. Use Verify before sending or accepting a credential.</p>
        </section>

        <section id="templates" aria-labelledby="templates-heading" className={sectionStyle}>
          <h2 id="templates-heading" className="text-xl font-bold">2. Choose a template</h2>
          <ManualReference caption="Preview is not issuance" headings={["Where", "What to do"]} rows={[
            ["Branding", "Choose a saved template; the first is selected automatically. Sample previews do not save changes or sign anything."],
            ["Template Style", "Choose an active saved template from your organization for single or batch issuance. Platform admins can select across organizations."],
            ["Nothing listed?", "Ask an administrator to save an active template under an issuer in your organization. Issuance stays disabled until one is available."],
          ]} />
          <aside className={noteStyle}><strong>Shared style ≠ shared identity.</strong> A shared template does not transfer signing identity, Document Store or certificate permissions. Certificates belong to your logged-in issuer.</aside>
          <details className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <summary className="cursor-pointer font-semibold">Layout and signing details</summary>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Layouts: <code>classic</code>, <code>modern</code>, <code>minimal</code>, <code>fta</code>. Other slugs render as classic.</li>
              <li>The signed style controls previews; the saved template database ID tracks ownership. Legacy style names remain supported.</li>
              <li>New issuance requires a saved template. Your own template&apos;s signing-profile mapping applies; shared templates use the existing default signing configuration.</li>
            </ul>
          </details>
        </section>

        <section id="issuance" aria-labelledby="issuance-heading" className={sectionStyle}>
          <h2 id="issuance-heading" className="text-xl font-bold">3. Issue a certificate</h2>
          <ManualFlow label="Review before you sign" steps={[
            ["Choose", "Open Issue. Select single or batch, then an available template."],
            ["Fill", "Enter recipient details or upload the batch. Check names and email addresses."],
            ["Review", "Check validity dates and select issuance methods."],
            ["Issue", "Sign, review the result and download the credential."],
          ]} />
          <ManualReference caption="Choose your issuance method" headings={["Method", "Before issuing"]} rows={[
            ["DID", "Ask your administrator to configure a valid signing identity. Review the resulting proof before sharing."],
            ["Ethereum", "Connect MetaMask on Sepolia. Check ETH balance, approve the transaction and review its result."],
          ]} />
          <aside className={noteStyle}><strong>Keep secrets private.</strong> Never share signing keys or authentication tokens.</aside>
        </section>

        <section id="dashboard" aria-labelledby="dashboard-heading" className={sectionStyle}>
          <h2 id="dashboard-heading" className="text-xl font-bold">4. Find, share and manage</h2>
          <p className="mt-3">Dashboard and Issuer Portal use the same table.</p>
          <figure className="mt-4 rounded-xl border border-dashed border-cyan-500 p-4">
            <figcaption className="font-semibold">Table controls at a glance (illustration)</figcaption>
            <div className="mt-3 rounded-lg bg-slate-100 p-3 dark:bg-slate-800">Search certificates: <span className="font-mono">name / email / template / status / ID / date</span></div>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Recipient ↕", "Template", "Issued ↕", "View", "Revoke", "Send"].map((label) => <span key={label} className="rounded border border-slate-300 px-3 py-1 dark:border-slate-600">{label}</span>)}
            </div>
          </figure>
          <ManualReference caption="Choose an action" headings={["Control", "Result"]} rows={[
            ["Search", "Type to filter. Clear the field to restore all rows."],
            ["Recipient / Issued", "Click once for ascending order; click again for descending. Arrows show direction."],
            ["View / row", "Open the certificate preview; download PDF or JSON."],
            ["Revoke", "Enter a reason. The row stays visible as revoked; Send is removed."],
            ["Send (ISSUED only)", "Review the fixed recorded recipient → Confirm → provider accepts the signed .json email. Cancel sends nothing."],
          ]} />
          <aside className={noteStyle}><strong>Accepted is not delivered.</strong> Check with the recipient before deliberately sending another copy. You cannot edit the recipient in the confirmation dialog.</aside>
          <aside className="mt-4 rounded-xl bg-cyan-50 p-4 dark:bg-cyan-950">
            <h3 className="font-bold">Need to verify?</h3>
            <p className="mt-2">The table does not run automatic verification. Open <Link href="/verify" className="font-semibold underline">Verify</Link> to check a credential. Review signature, issuer authorization, applicable blockchain evidence and lifecycle status; unavailable results are not verification success.</p>
          </aside>
        </section>

        <section id="profile" aria-labelledby="profile-heading" className={sectionStyle}>
          <h2 id="profile-heading" className="text-xl font-bold">5. My Profile</h2>
          <ManualReference caption="Dashboard → My Profile (beside Issue certificate)" headings={["Setting", "Can I change it?"]} rows={[
            ["Display name", "Yes — edit and save."],
            ["Email, roles, organization, issuer", "Read-only. Contact your administrator."],
            ["Password", "Choose Reset password; follow the email sent to your registered address."],
            ["Organization menu", "Visible only to platform admins."],
          ]} />
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
