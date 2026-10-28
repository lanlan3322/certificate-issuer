import Link from "next/link";
import { ManualFlow, ManualReference } from "../../../components/ManualIllustrations";

const sectionStyle = "scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6";
const detailStyle = "mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700";
const noteStyle = "mt-4 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950 dark:text-amber-100";

export default function AdminManualPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-slate-800 dark:text-slate-200 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700 dark:text-cyan-300">Documentation</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">Admin Manual</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">Set up → invite → test → operate. Expand technical and compliance details when needed.</p>
      </header>
      <nav aria-label="Admin manual sections" className="mb-8 flex flex-wrap gap-2 text-sm font-semibold">
        {[["organizations", "Structure"], ["invitations", "Invite"], ["recovery", "Recovery"], ["operations", "Operations"], ["legal", "Legal & email"], ["pdpa", "PDPA procedures"], ["sign-off", "Sign-off status"]].map(([id, title]) => (
          <a key={id} href={`#${id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-cyan-800 hover:bg-cyan-50 dark:border-slate-600 dark:text-cyan-300 dark:hover:bg-slate-800">{title}</a>
        ))}
      </nav>
      <div className="space-y-6 text-sm leading-6">
        <section id="organizations" aria-labelledby="organizations-heading" className={sectionStyle}>
          <h2 id="organizations-heading" className="text-xl font-bold">1. Understand the structure</h2>
          <ManualFlow label="Organization → issuer → saved template" steps={[
            ["Organization", "Groups issuers and determines available templates."],
            ["Issuer", "Owns saved templates and issued certificate activity."],
            ["Saved template", "Supplies the selected visual style."],
            ["Certificate", "Remains owned by the issuing login's issuer; sharing style does not transfer identity."],
          ]} />
          <ManualReference caption="Issuer Management quick guide" headings={["Control", "Behaviour"]} rows={[
            ["Open Issuer Management", "Loads available issuers and active organizations."],
            ["Organization view", "Filter issuers by organization; switching back preserves the full list."],
            ["Organization directory", "Requires platform-admin. Loading and permission errors appear on the page."],
            ["Before invitation", "Check issuer record, organization assignment and intended role."],
          ]} />
        </section>

        <section id="invitations" aria-labelledby="invitations-heading" className={sectionStyle}>
          <h2 id="invitations-heading" className="text-xl font-bold">2. Invite an issuer user</h2>
          <ManualReference caption="Setup gate — complete before inviting" headings={["Requirement", "Check"]} rows={[
            ["Database", <span key="database">Apply <code className="break-all">012_issuer_user_invitations.sql</code>.</span>],
            ["Email", "Configure Supabase SMTP and test invitation delivery."],
            ["Redirect", <span key="redirect">Allow the deployed <code>/issuer/?mode=reset</code> URL in Supabase Auth.</span>],
          ]} />
          <ManualFlow label="Invitation journey" steps={[
            ["Create issuer", "Choose organization and contact email."],
            ["Choose role", "issuer-operator (default) or issuer-admin."],
            ["Send invitation", "Supabase emails the contact address."],
            ["Set password", "Recipient opens the link and creates a password."],
          ]} />
          <aside className={noteStyle}><strong>No silent reassignment.</strong> Existing accounts are not reassigned or promoted. The role applies to the new login user, not the issuer record.</aside>
          <details className={detailStyle}>
            <summary className="cursor-pointer font-semibold">Invitation email link</summary>
            <p className="mt-3">Default: <code>{"{{ .ConfirmationURL }}"}</code>. Custom token-hash alternative:</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800"><code>{"{{ .SiteURL }}/auth/recovery/?token_hash={{ .TokenHash }}&type=invite"}</code></pre>
          </details>
        </section>

        <section id="recovery" aria-labelledby="recovery-heading" className={sectionStyle}>
          <h2 id="recovery-heading" className="text-xl font-bold">3. Configure password recovery</h2>
          <ManualFlow label="Configure once; test with a fresh email" steps={[
            ["Allow redirect", "Supabase Auth → URL Configuration. Allow https://verifiable.sg/issuer/?mode=reset or your deployed hostname."],
            ["Match hostnames", "Keep Site URL and allow-list consistent, including www if used."],
            ["Check email link", "Use ConfirmationURL by default, or the custom recovery link below."],
            ["Test end to end", "Request fresh email → open link → verify token → set password."],
          ]} />
          <div className="mt-4 rounded-xl bg-cyan-50 p-4 dark:bg-cyan-950">
            <h3 className="font-bold">Password checklist</h3>
            <p className="mt-2">10+ characters · uppercase · lowercase · number · non-whitespace special character</p>
          </div>
          <details className={detailStyle}>
            <summary className="cursor-pointer font-semibold">Custom recovery link and compatibility</summary>
            <p className="mt-3">Default template: <code>{"{{ .ConfirmationURL }}"}</code>. Custom alternative:</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800"><code>{"{{ .SiteURL }}/auth/recovery/?token_hash={{ .TokenHash }}&type=recovery"}</code></pre>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>In an HTML link attribute, encode the separator as <code>&amp;amp;</code>.</li>
              <li>Target <code>/auth/recovery/</code>, not Overview. Older Overview token-hash recovery links are forwarded; existing custom links remain supported.</li>
              <li>Password setup opens even if already signed in.</li>
            </ul>
          </details>
        </section>

        <section id="operations" aria-labelledby="operations-heading" className={sectionStyle}>
          <h2 id="operations-heading" className="text-xl font-bold">4. Pre-flight operations check</h2>
          <ManualReference caption="Before publishing credentials" headings={["Check", "Ready when…"]} rows={[
            ["Identity", "Issuer workspace and DID signing configuration are valid."],
            ["Templates", "An active saved template is available to the issuer's organization."],
            ["Ethereum (if used)", "Network, funds and Document Store permissions are correct."],
            ["Verification", "Signature, issuer authorization and applicable blockchain checks succeed. Unavailable is not verified."],
            ["Lifecycle & audit", "Review status/revocation alongside verification and audit activity."],
          ]} />
          <aside className={noteStyle}><strong>Safe troubleshooting only.</strong> Never include private signing keys, password-reset links or authentication tokens in reports.</aside>
        </section>

        <section id="legal" aria-labelledby="legal-heading" className={sectionStyle}>
          <h2 id="legal-heading" className="text-xl font-bold">5. Legal, consent and email</h2>
          <ManualReference caption="What is already in the interface" headings={["Surface", "Behaviour"]} rows={[
            ["Public legal pages", <span key="pages"><Link href="/privacy" className="underline">Privacy Policy</Link> · <Link href="/terms" className="underline">Terms of Service</Link> · <Link href="/contact" className="underline">Contact Us</Link>. Legal footer is public; Documentation requires login.</span>],
            ["Accounts", "Self-registration remains disabled. Invitation/password setup shows the account-creation notice; no mandatory checkbox or auth changes."],
            ["Cookies", "Necessary storage stays on; analytics defaults off; marketing is not enabled. Cookie Preferences reopens choices."],
            ["Embedded renderer", <span key="renderer"><code>/renderer/</code> has no application chrome or consent overlay, preserving external viewers.</span>],
          ]} />
          <details className={detailStyle}>
            <summary className="cursor-pointer font-semibold">Developer reference: optional analytics</summary>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Browser key: <code>verifiable-cookie-consent</code>. Clearing storage or changing consent version prompts again; failures are visible, never consent.</li>
              <li>Preferences are per browser, not a server-side compliance ledger. Server audit/security records are independent of analytics.</li>
              <li>Assistant analytics checks consent on every event. Future Google Analytics, Plausible or PostHog integrations must call <code>hasAnalyticsConsent()</code> before scripts/events.</li>
              <li>Respond to <code>verifiable-cookie-consent-changed</code> and browser storage changes. Stop collection and clear optional cookies on withdrawal. No SDK is installed by this release.</li>
            </ul>
          </details>
          <ManualFlow label="Certificate Send: server → Resend → recorded recipient" steps={[
            ["Configure server", "Set RESEND_API_KEY and EMAIL_FROM to a Resend-verified sender. Never use browser-exposed variables."],
            ["Confirm recipient", "Send attaches stored signed JSON plus the legal footer to the recorded address."],
            ["Check eligibility", "Session issuer's issued, unexpired credentials only. Limit: 20 attempts per user per 15 minutes."],
            ["Review acceptance", "Audit records provider acceptance, not delivery. Confirm recipient/provider status before another send."],
          ]} />
          <aside className={noteStyle}><strong>Retry carefully.</strong> The same confirmation reuses its Resend idempotency key (24-hour provider retention). After that window, confirm provider status before retrying an ambiguous request.</aside>
          <details className={detailStyle}>
            <summary className="cursor-pointer font-semibold">Deploy provider email notices</summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Append <code>emails/legal-footer.html</code> to Supabase invitation, confirmation, reset and notification templates. Preserve working links and redirect settings.</li>
              <li>Baselines: <code>emails/supabase-invitation.html</code>, <code>emails/supabase-registration.html</code>, <code>emails/supabase-reset.html</code>; all use <code>{"{{ .ConfirmationURL }}"}</code>. Test before replacing any working custom token-hash link.</li>
              <li>The built-in certificate sender includes a plain-text footer. Separate external workflows need HTML and <code>emails/legal-footer.txt</code> in their respective message alternatives.</li>
              <li>Test each enabled email type and its <code>https://verifiable.sg/privacy</code> / <code>https://verifiable.sg/terms</code> links. Repository snippets do not deploy Supabase or Resend changes.</li>
            </ol>
          </details>
        </section>

        <section id="pdpa" aria-labelledby="pdpa-heading" className={sectionStyle}>
          <h2 id="pdpa-heading" className="text-xl font-bold">6. PDPA response playbook</h2>
          <aside className={noteStyle}><strong>Operational handoff, not certification.</strong> These steps are not confirmation that staffing, contracts or automated workflows are implemented.</aside>
          <ManualReference caption="Keep these timings visible" headings={["Event", "Action / timing"]} rows={[
            ["Access / correction", "Respond as soon as reasonably possible. If unable within 30 days, give written notice within that period stating when to expect a response."],
            ["Suspected breach", "Escalate immediately; contain and preserve evidence. A data intermediary notifies its engaging organization without undue delay when it has reason to believe a breach occurred."],
            ["Notifiable breach", "Notify PDPC as soon as practicable; no later than three calendar days after that determination. Do not delay assessment."],
            ["Affected individuals", "If significant harm is likely, notify as soon as practicable, at the same time as or after PDPC, subject to exceptions. Significant scale alone does not automatically require individual notification."],
          ]} />
          <ManualFlow label="Incident response — do not wait for a numerical threshold" steps={[
            ["Escalate & contain", "Notify incident lead and DPO. Secure evidence; record discovery and assessment times; coordinate issuers/providers."],
            ["Assess promptly", "Assess reasonably and expeditiously. Significant harm OR significant scale can trigger PDPC notification; scale generally means 500+ individuals."],
            ["Notify as required", "Apply the timings above and statutory exceptions. Significant harm may require notification below 500 people."],
            ["Record & rehearse", "Record decisions, remediation and communications. Keep contacts/templates current and rehearse. No automated detection/reporting is implied."],
          ]} />
          <details className={detailStyle}>
            <summary className="cursor-pointer font-semibold">Control checklist: owners, requests, retention and transfers</summary>
            <ManualReference caption="Assign an owner and retain evidence for each control" headings={["Control", "Required handoff"]} rows={[
              ["Accountability", "Identify the legal operator; appoint a DPO; monitor support@verifiable.sg with a backup and complaint escalation. Contracts must reflect actual issuer/platform/data-intermediary roles; issuer duties do not replace platform duties."],
              ["Inventory & notice", 'Record category, source, purpose, recipient, location and consent/deemed-consent/exception basis. Give timely notices; assess new purposes/SDKs. Account acceptance and a "necessary" cookie label are not blanket legal bases.'],
              ["Access & correction", "Log receipt, verify identity proportionately and assign an owner. Include applicable preceding-year use/disclosure information, assess exceptions and correction notices to past recipients. Preserve relevant data and record outcomes."],
              ["Withdrawal", "Record purposes and reasonable notice; explain consequences. Stop consent-based collection, use and disclosure when effective, including intermediaries/agents, unless required or authorised by law. Retention needs do not authorise continued use/disclosure."],
              ["Retention", 'Approve category-specific periods/owners for accounts, credentials, verification logs, audit, enquiries, backups and provider copies. Record legal holds/reviews. Cease retention or remove identifying associations once original purpose ends and no legal/business retention need remains. Test deletion/anonymisation procedures; never retain indefinitely "just in case".'],
              ["Overseas transfers", "Verify actual Supabase, Vercel, Resend and other provider locations, contracts, subprocessors and onward transfers. Confirm legally enforceable comparable-protection safeguards or another permitted mechanism. Keep evidence; provider/region lists alone do not satisfy the Transfer Limitation Obligation."],
            ]} />
          </details>
          <p className="mt-4">Official guidance: <a href="https://www.pdpc.gov.sg/data-protection-obligations" className="underline">PDPC obligations</a> · <a href="https://www.pdpc.gov.sg/organisations/e-services/report-your-organisations-data-breach" className="underline">Report a breach</a>.</p>
        </section>

        <section id="sign-off" aria-labelledby="sign-off-heading" className={sectionStyle}>
          <h2 id="sign-off-heading" className="text-xl font-bold">7. Production sign-off</h2>
          <aside className={noteStyle}>
            <h3 className="font-bold">PDPA: attestation recorded, overall approval pending</h3>
            <p className="mt-2"><strong>Operator identity: not confirmed.</strong> Do not infer the legal entity, UEN, registered address or approver, or replace public placeholders without confirmation.</p>
          </aside>
          <details className={detailStyle}>
            <summary className="cursor-pointer font-semibold">Attestation record and evidence still needed</summary>
            <p className="mt-3">28 October 2026 (Singapore time): the project representative stated they were authorised by the operator and that the controls below were operating. They selected attestation-only recording; overall sign-off stays pending. No supporting details or evidence were supplied; statements are not independently verified.</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li><strong>DPO and contact: operator-attested, evidence pending.</strong> Appointment, responsible function, mailbox owner/backup and delivery/response test for <code>support@verifiable.sg</code>.</li>
              <li><strong>Provider and transfer safeguards: operator-attested, evidence pending.</strong> Actual regions, contracts/DPAs, subprocessor/onward-transfer assessment and comparable-protection evidence.</li>
              <li><strong>Retention controls: operator-attested, evidence pending.</strong> Approved periods/justifications, owners, holds and dated deletion/anonymisation tests for backups/provider copies.</li>
              <li><strong>Request and incident procedures: operator-attested, evidence pending.</strong> Owners/backups, request records/processes, issuer agreements, notification procedures and training/exercise evidence.</li>
            </ul>
            <p className="mt-3">This record is not an authenticated approval workflow, external audit, legal opinion or compliance certification. Store evidence in an access-controlled compliance repository, not public pages/source. Public policy/contact qualifications remain until confirmed.</p>
          </details>
          <ManualReference caption="Approval gates — do not mark complete without evidence" headings={["Gate", "Evidence / decision"]} rows={[
            ["Legal review", "Qualified counsel reviews policies and terms. UI controls alone do not establish PDPA or GDPR compliance."],
            ["Operator & controls", "Confirm legal identity, DPO/contact, provider regions/transfers, contracts, retention and request/breach procedures."],
            ["Deployment checks", "Validate cookie inventory/optional trackers. Separately deploy and test provider email templates."],
            ["Accountable approval", "Record approver, date, scope, limitations and next review in the controlled record. Reassess after material processing/provider changes."],
          ]} />
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
