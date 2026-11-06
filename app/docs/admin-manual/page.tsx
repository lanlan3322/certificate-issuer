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
        <p className="mt-3 text-slate-600 dark:text-slate-300">Configure your organization&apos;s CaaS workspace: set up issuer access, test credential workflows, and operate with appropriate controls.</p>
      </header>
      <nav aria-label="Admin manual sections" className="mb-8 flex flex-wrap gap-2 text-sm font-semibold">
        {[["organizations", "Structure"], ["rbac", "RBAC"], ["issuer-members", "Issuer members"], ["issuer-keys", "Issuer keys"], ["recovery", "Recovery"], ["operations", "Operations"], ["legal", "Legal & email"], ["pdpa", "PDPA procedures"], ["sign-off", "Sign-off status"]].map(([id, title]) => (
          <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 py-2 text-cyan-800 hover:bg-cyan-50 dark:border-slate-600 dark:text-cyan-300 dark:hover:bg-slate-800">{title}</a>
        ))}
      </nav>
      <div className="space-y-6 text-sm leading-6">
        <section id="organizations" aria-labelledby="organizations-heading" className={sectionStyle}>
          <h2 id="organizations-heading" className="text-xl font-bold">1. Understand the structure</h2>
          <ManualFlow label="Organization → issuer → saved template" steps={[
            ["Organization", "Groups issuers and determines available templates."],
            ["Issuer", "Owns saved templates and issued credential activity."],
            ["Saved template", "Supplies the selected visual style."],
            ["Certificate", "Uses the selected template's issuer ownership; historical signed records remain unchanged."],
          ]} />
          <ManualReference caption="Issuer Management quick guide" headings={["Control", "Behaviour"]} rows={[
            ["Open Issuers", "Use Administration in the desktop workspace sidebar or the mobile navigation menu. Create, inspect, edit and deactivate issuers and view their key metadata from the directory. Existing identity profiles remain in the identity registry; new DID configuration is not available in this phase."],
            ["Issuer metadata", "Display name is the public label; the issuer name remains its legacy name, and slug is the issuer code unique within its organization. Organization ownership cannot be transferred."],
            ["Lifecycle", "Deactivate an issuer to stop normal use while retaining historical records. Suspended and deleted states are distinct; only platform admins can soft-delete."],
            ["Organization directory", "Platform admins use Administration → Organizations to create, edit, view or deactivate organizations and manage memberships. Organization admins can open My organization to manage their own members."],
            ["Issued credentials", "Platform admins can view and manage credentials across organizations. Organization admins can read their organization's credentials; issuer members can read only assigned issuers' records. Issuer operators may issue, revoke and send for their assigned issuers."],
            ["Issuer members", "Open issuer details to add an existing application user ID, change the issuer role or remove the assignment. Changes affect only that issuer and take effect on the next authorized request."],
          ]} />
          <div id="rbac" className="scroll-mt-28">
            <h3 className="mt-6 text-lg font-bold">Role-based access control (RBAC)</h3>
            <ManualReference caption="Platform and organization RBAC table" headings={["Role", "Scope and permissions"]} rows={[
              ["platform_admin", "Platform-wide: create, edit, deactivate and soft-delete organizations and issuers; manage global user roles, memberships and templates; view, issue, revoke and send credentials across organizations."],
              ["organization_admin", "Own active organization: manage organization memberships, issuer metadata, issuer assignments and templates; read all organization credentials. Cannot edit organization profile/lifecycle, grant platform administration or soft-delete issuers. Issuance, revocation and sending require a separate issuer_operator assignment."],
              ["issuer", "Organization role for credential operations. Access requires an issuer assignment; issuer_operator grants issue, revoke and send for that issuer. The organization role or legacy issuer ID alone does not grant access after assignment removal."],
              ["viewer", "Read-only. Issuer-bound or explicitly assigned users are restricted to assigned issuers. An organization viewer with no legacy issuer binding and no issuer assignments retains organization-wide read access. No issuer, template or credential writes."],
            ]} />
            <ManualReference caption="Issuer-scoped RBAC table" headings={["Issuer membership role", "Permissions for the assigned issuer only"]} rows={[
              ["issuer_admin", "Read issuer resources and credentials; create, update and deactivate templates. Cannot manage issuer metadata or memberships, administer the organization, issue, revoke or send credentials through this role."],
              ["issuer_operator", "Read issuer resources and credentials; issue, revoke and send credentials. Cannot manage templates, issuer metadata, memberships or the organization."],
              ["viewer", "Read issuer resources, templates and credentials. Cannot create, edit, deactivate, issue, revoke or send."],
            ]} />
            <p className="mt-4">Organization and issuer permissions are separate and combine when both are assigned. A user has one membership role per issuer and may have different roles for different issuers. Removing a membership removes that assignment&apos;s grants on the next authorized request; organization or platform administrator grants still apply.</p>
            <p className="mt-4">Issuer key management is administrator-only and controlled by the key service&apos;s authorization. Issuer membership permits reading key metadata but does not itself grant rotation or export rights; non-managers see fingerprints only. The one-time initial export is further restricted to the original creating administrator.</p>
            <aside className={noteStyle}><strong>Operational checks.</strong> Issuance resolves the issuer from the saved template; users do not choose a different issuer while issuing. Issuing, revoking and sending require an active issuer and organization. Deactivation retains historical records and does not change cryptographic verification.</aside>
          </div>
        </section>

        <section id="issuer-keys" aria-labelledby="issuer-keys-heading" className={sectionStyle}>
          <h2 id="issuer-keys-heading" className="text-xl font-bold">Issuer keys and one-time export</h2>
          <p className="mt-3">Open Administration → Issuer directory → issuer details. A newly created issuer is selected automatically so its key package is accessible immediately. Viewing key metadata never generates keys. Authorized administrators see P-256 (TrustVC-compatible) algorithm, fingerprint, version, status and creation/rotation dates.</p>
          <ManualFlow label="Manage issuer keys safely" steps={[
            ["Download Key Pair", "Enabled only when the server reports availability: version 1, within 10 minutes of initial creation, for the original creating administrator only. Confirm to request the ZIP; no automatic download or prefetch occurs."],
            ["Protect the archive", "The ZIP contains a private PEM export. Store it securely and never paste it into application fields, logs or support reports."],
            ["Rotate Key", "Confirm to create the next version as pending only. The active key is not replaced or activated by rotation."],
            ["Activation prerequisite", "A pending key needs a matching existing verified, published DID binding before activation. This panel does not configure DID bindings or offer activation."],
          ]} />
          <aside className={noteStyle}><strong>One retrieval only.</strong> The private ZIP cannot be retrieved again. A lost response cannot be retried, even if the browser did not save the file. Download failures may already have consumed the export; contact your administrator rather than retrying. Rotated versions do not receive another initial key export.</aside>
        </section>

        <section id="issuer-members" aria-labelledby="issuer-members-heading" className={sectionStyle}>
          <h2 id="issuer-members-heading" className="text-xl font-bold">2. Manage issuer members</h2>
          <ManualFlow label="Assign access to an existing account" steps={[
            ["Choose issuer", "Open Administration → Issuer directory and view the issuer details."],
            ["Find user ID", "Use the existing application user ID supplied by your account administrator; issuer membership does not create an account or send an invitation."],
            ["Choose scope", "Assign issuer_admin, issuer_operator or viewer for this issuer only."],
            ["Review changes", "Change a member's role or remove the assignment from the issuer detail panel."],
          ]} />
          <ManualReference caption="Issuer membership roles" headings={["Role", "Access"]} rows={[
            ["issuer_admin", "Manage templates owned by the assigned issuer."],
            ["issuer_operator", "Issue, revoke and send credentials for the assigned issuer."],
            ["viewer", "Read resources for the assigned issuer."],
          ]} />
          <aside className={noteStyle}><strong>Least privilege.</strong> Check the user ID and issuer before saving. Role changes replace that user&apos;s role for this issuer; removing the membership ends issuer-scoped access without deleting historical records or the account.</aside>
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
            ["Public resources", <span key="pages"><Link href="/privacy" prefetch={false} className="underline">Privacy Policy</Link> · <Link href="/terms" prefetch={false} className="underline">Terms of Service</Link> · <Link href="/contact" prefetch={false} className="underline">Contact support</Link>. Resources and legal links are public. Workspace actions require the appropriate organization role.</span>],
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
          <ManualFlow label="Certificate Send: server → shared SMTP provider → recorded recipient" steps={[
            ["Configure server", "Copy Supabase Auth's SMTP settings into Vercel: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM (same sender). Supabase does not share these automatically. Never use browser-exposed variables."],
            ["Confirm recipient", "Send attaches stored signed JSON plus the legal footer to the recorded address."],
            ["Check eligibility", "Session issuer's issued, unexpired credentials only. Limit: 20 attempts per user per 15 minutes."],
            ["Review acceptance", "Audit records provider acceptance, not delivery. Confirm recipient/provider status before another send."],
          ]} />
          <aside className={noteStyle}><strong>Retry carefully.</strong> SMTP does not guarantee deduplication. The same confirmation reuses its Message-ID for tracing, but retries can send duplicates. Confirm recipient/provider status before retrying an ambiguous request. Port 465 uses implicit TLS; other ports require STARTTLS. Password reset continues through Supabase Auth unchanged.</aside>
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
