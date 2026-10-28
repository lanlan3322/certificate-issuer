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
        <a href="#legal" className="underline underline-offset-4">Legal and consent setup</a>
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
            <h3 className="mt-5 font-bold">PDPA operational procedures to establish and verify</h3>
            <p className="mt-3 text-sm">These are required operational handoffs, not confirmation that staffing, contracts, or automated workflows have already been implemented.</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li><strong>Accountability:</strong> identify the operating legal entity, appoint a DPO, monitor <code>support@verifiable.sg</code>, assign a backup, and document complaint escalation. Confirm issuer/platform/data-intermediary responsibilities in contracts based on actual processing; issuer duties do not displace platform duties.</li>
              <li><strong>Data inventory and notification:</strong> record each data category, source, purpose, recipient, location, and applicable consent, deemed-consent, or exception basis. Provide notices at the required time. Neither account acceptance nor a &quot;necessary&quot; cookie label is a blanket legal basis. Assess new purposes and SDKs before deployment.</li>
              <li><strong>Access and correction:</strong> log the date received, verify identity proportionately, and assign an owner. Include applicable use/disclosure information for the preceding year; assess statutory exceptions and correction notifications to past recipients. Respond as soon as reasonably possible. If unable to respond within 30 days, give written notice within that period stating when a response can be expected. Preserve relevant data while handling the request and record the outcome.</li>
              <li><strong>Withdrawal:</strong> record the specified purposes and reasonable notice, explain likely consequences, and stop consent-based collection, use, and disclosure when effective, including through relevant intermediaries and agents, unless otherwise required or authorised by law. Assess retained records separately; a business retention need is not blanket permission for continued use or disclosure.</li>
              <li><strong>Retention:</strong> approve category-specific periods and owners for accounts, credentials, verification logs, audit records, enquiries, backups, and provider copies. Document legal holds and review dates. Cease retention or remove identifying associations once the original purpose is no longer served and retention is no longer necessary for legal or business purposes. Test deletion/anonymisation procedures; do not retain data indefinitely &quot;just in case&quot;.</li>
              <li><strong>Overseas transfers:</strong> verify actual Supabase, Vercel, Resend, and other provider locations, contracts, subprocessors, onward transfers, and applicable legally enforceable comparable-protection safeguards or another permitted mechanism. Keep evidence; listing providers or regions alone does not satisfy the Transfer Limitation Obligation.</li>
            </ul>
            <h3 className="mt-5 font-bold">Suspected personal-data breach response</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Escalate immediately to the designated incident lead and DPO. Contain exposure, preserve evidence securely, record discovery and assessment times, and coordinate with affected issuers/providers. A data intermediary must notify its engaging organization without undue delay when it has reason to believe a breach has occurred.</li>
              <li>Assess reasonably and expeditiously whether the breach is notifiable. Significant harm or significant scale can trigger PDPC notification; significant scale generally means 500 or more affected individuals. Do not wait for that threshold if significant harm is likely. Record the assessment and applicable statutory exceptions.</li>
              <li>Once determined notifiable, notify PDPC as soon as practicable and no later than three calendar days after that determination. The deadline is not three business days and does not permit delaying assessment.</li>
              <li>Where notification to affected individuals is required because significant harm is likely, notify them as soon as practicable, at the same time as or after notifying PDPC, subject to applicable exceptions. Significant scale alone does not automatically require individual notification.</li>
              <li>Document notification decisions, remedial action, communications, and lessons learned. Rehearse the process and keep current contact details and notification templates. These manual instructions do not implement automated breach detection or reporting.</li>
            </ol>
            <p className="mt-3 text-sm">Official guidance: <a href="https://www.pdpc.gov.sg/data-protection-obligations" className="underline">PDPC data protection obligations</a> and <a href="https://www.pdpc.gov.sg/organisations/e-services/report-your-organisations-data-breach" className="underline">reporting a data breach</a>.</p>
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
          <section aria-labelledby="pdpa-attestation-heading" className="mt-5 rounded-xl border border-slate-300 p-4 dark:border-slate-600">
            <h3 id="pdpa-attestation-heading" className="font-bold">PDPA sign-off status: attestation recorded, overall approval pending</h3>
            <p className="mt-2 text-sm">On 28 October 2026 (Singapore time), the project representative stated that they were authorised by the platform operator to attest to the controls below and confirmed they were in place and operating. They expressly selected attestation-only recording with overall sign-off remaining pending. No supporting details or evidence were supplied; these statements have not been independently verified.</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
              <li><strong>Operator identity: not confirmed.</strong> Legal entity, applicable UEN, registered address, and attribution of approval remain unresolved. Do not replace public placeholders with inferred details.</li>
              <li><strong>DPO and contact: operator-attested, evidence pending.</strong> Obtain the appointment record, responsible function, monitored mailbox owner and backup, and delivery/response test for <code>support@verifiable.sg</code>.</li>
              <li><strong>Provider and transfer safeguards: operator-attested, evidence pending.</strong> Retain actual deployment regions, relevant contract/DPA references, subprocessor and onward-transfer assessments, and evidence supporting the applicable comparable-protection mechanism.</li>
              <li><strong>Retention controls: operator-attested, evidence pending.</strong> Obtain approved category-specific periods and justifications, accountable owners, legal-hold arrangements, and dated deletion/anonymisation test results covering backups and provider copies.</li>
              <li><strong>Request and incident procedures: operator-attested, evidence pending.</strong> Obtain accountable functions and backups, request-handling records/processes, issuer processing agreements, notification procedures, and dated training/exercise evidence.</li>
            </ul>
            <p className="mt-3 text-sm">This is a documentation record of the representative&apos;s statement, not an authenticated approval workflow, external audit, legal opinion, or certification of PDPA compliance. Keep supporting records in an access-controlled compliance repository, not in public pages or source code. The policy and contact page remain qualified until facts and evidence are confirmed.</p>
          </section>
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
        <section id="legal" aria-labelledby="legal-heading" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 id="legal-heading" className="text-xl font-bold">5. Legal, consent, and email setup</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>Public legal pages are <Link href="/privacy" className="underline">Privacy Policy</Link>, <Link href="/terms" className="underline">Terms of Service</Link>, and <Link href="/contact" className="underline">Contact Us</Link>. Legal footer links are public; Documentation links still require login.</li>
            <li>Self-registration remains disabled. The invitation/password-setup screen displays the account-creation notice; no mandatory checkbox or authentication changes are introduced.</li>
            <li>Cookie choices are stored locally under <code>verifiable-cookie-consent</code>. Necessary storage remains enabled. Analytics defaults to off and assistant analytics checks consent on each event. Marketing is not enabled. Cookie Preferences can reopen the modal anytime.</li>
            <li>Clearing storage or changing the consent version requires a new choice. Storage failures are shown, not treated as consent. Preferences are per browser, not a server-side compliance ledger.</li>
            <li>Future Google Analytics, Plausible, or PostHog integrations must check <code>hasAnalyticsConsent()</code> before loading scripts or sending events, respond to <code>verifiable-cookie-consent-changed</code> and browser storage changes, and stop collection/clear their optional cookies after withdrawal. No SDK is installed by this release.</li>
            <li>Embedded <code>/renderer/</code> documents remain free of application chrome and consent overlays to preserve external certificate-viewer integrations. Ordinary public, verification, issuer, and account pages receive the legal footer.</li>
          </ul>
          <h3 className="mt-5 font-bold">Apply legal notices to email providers</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>In Supabase Authentication email templates, append <code>emails/legal-footer.html</code> to the existing invitation, registration confirmation, reset, and other notification templates. Preserve the existing working action link and redirect settings.</li>
            <li>Complete baseline templates are supplied in <code>emails/supabase-invitation.html</code>, <code>emails/supabase-registration.html</code>, and <code>emails/supabase-reset.html</code>. They use <code>{"{{ .ConfirmationURL }}"}</code>. Do not replace a working custom token-hash link without validating the complete recovery/invitation flow.</li>
            <li>For Resend-managed certificate and notification emails, append the HTML footer and <code>emails/legal-footer.txt</code> to both message alternatives in the external sender&apos;s templates. No application-owned email sender was found in this checkout, so this is a provider-side deployment step, not an already-applied change.</li>
            <li>Send test messages for each enabled email type. Check links to <code>https://verifiable.sg/privacy</code> and <code>https://verifiable.sg/terms</code>. Repository templates do not automatically update Supabase or Resend.</li>
          </ol>
          <aside className="mt-5 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            <h3 className="font-bold">Before production legal sign-off</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Have qualified counsel review policies and terms. UI controls alone do not establish PDPA or GDPR compliance.</li>
              <li>Complete the company name, UEN, and registered address placeholders; confirm DPO appointment and the monitored contact <code>support@verifiable.sg</code>. Do not assert operational completion until evidenced.</li>
              <li>Confirm actual provider regions, cross-border safeguards, retention schedules, vendor contracts, and request/breach-response procedures.</li>
              <li>Validate the cookie inventory and any optional trackers before enabling them. Server audit/security records remain independent of optional analytics.</li>
              <li>Resolve operator identity and review the evidence listed above. Record the accountable approver, decision date, scope, limitations, and next review in the controlled compliance record; repeat the review after material processing or provider changes. Counsel review and provider email-template deployment/testing remain separate pending tasks unless evidenced.</li>
            </ul>
          </aside>
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
