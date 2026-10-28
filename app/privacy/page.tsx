import type { Metadata } from "next";
import LegalPage from "../../components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Verifiable.sg",
  description: "How Verifiable.sg handles account and certificate information, verification activity, cookies, privacy rights, and Singapore PDPA requests.",
};

export default function PrivacyPage() {
  return <LegalPage
    title="Privacy Policy"
    introduction="This policy explains how personal data is handled when you use Verifiable.sg to manage, issue, view, or verify digital credentials."
    sections={[
      { id: "introduction", title: "Introduction", content: <>
        <p>Verifiable.sg provides a digital credential platform. Your issuing organization determines much of the information included in a certificate and why it is issued. We operate the platform and process information needed to deliver it.</p>
        <p>Responsibilities depend on the actual processing arrangement. Where we process personal data on an organization&apos;s behalf under a written contract, we may act as its data intermediary. We remain responsible for obligations that apply to us in that role and for processing we undertake for our own purposes, such as platform account administration. An issuer&apos;s responsibilities do not remove our own obligations.</p>
        <p>For issuer-controlled certificate information, contact your issuing organization first. For platform account, security, or privacy questions, contact our data protection contact at <a href="mailto:dpo@verifiable.sg">dpo@verifiable.sg</a>.</p>
      </> },
      { id: "information", title: "Information We Collect", content: <ul>
        <li>Account details and organization/issuer assignments provided during account setup.</li>
        <li>Certificate details submitted by authorized issuers and credentials submitted for verification.</li>
        <li>Technical activity needed for delivery, security, audit, and troubleshooting.</li>
        <li>Enquiries you send us, and optional usage analytics only when you agree.</li>
      </ul> },
      { id: "accounts", title: "Account Information", content: <p>This includes your email, display name, account identifiers, assigned roles, and organization/issuer membership. Authentication is provided through Supabase. Passwords are handled by the authentication service; do not send passwords, invitation links, or reset tokens in support requests.</p> },
      { id: "certificates", title: "Certificate Information", content: <>
        <ul><li>Credentials can include recipient names, email addresses, course or achievement details, identifiers, dates, and issuer information.</li>
          <li>The issuer is responsible for having appropriate authority to submit recipient information and for providing required notices.</li>
          <li>Downloaded or shared credentials may be retained by recipients and third-party verifiers outside our control.</li>
          <li>Blockchain anchoring publishes hashes and transaction information, not a mechanism for deleting personal data. Public DID documents contain issuer identifiers and public verification keys. Public blockchain records may be permanent and cannot simply be erased.</li></ul>
        <p>Do not put unnecessary sensitive personal data into credentials or public identifiers.</p>
      </> },
      { id: "verification", title: "Verification Activity", content: <p>Verification can process a credential or identifier, verification outcome, certificate status, time, and technical information such as IP addresses. Verification logs support security and audit. Verifying a credential may require resolving public issuer DID documents, status lists, and blockchain information through network providers. Only share credentials with parties you trust.</p> },
      { id: "cookies", title: "Cookie Usage", content: <>
        <ul><li><strong>Necessary:</strong> authentication/session cookies, security, service features, and browser storage for preferences. These are not controlled by optional analytics consent.</li>
          <li><strong>Analytics:</strong> optional usage measurement, including assistant interaction analytics. It is off before consent and after rejection.</li>
          <li><strong>Marketing:</strong> not enabled. Any future introduction needs a separate consent choice.</li></ul>
        <p>Your cookie choice is stored in this browser&apos;s localStorage under <code>verifiable-cookie-consent</code>, with necessary/analytics choices, a disabled marketing category, a date, and a policy version. It is not a server-side consent record. Clearing browser storage removes this choice.</p>
        <p>Use <strong>Cookie Preferences</strong> in the footer to change your choice or withdraw analytics consent anytime. Rejection does not block account or certificate features. A saved choice does not automatically expire; a consent-version change can require a new choice.</p>
        <p>Other service storage may remember your theme, assistant conversation, or workflow state. Do not enter sensitive personal data into an assistant conversation. No Google Analytics, Plausible, or PostHog SDK is enabled by this release.</p>
        <p>The PDPA applies to cookies and similar technologies where personal data is collected, used, or disclosed; it does not impose a blanket opt-in rule for every cookie. The applicable consent, deemed-consent, or statutory-exception basis must be assessed for each purpose. Calling storage &quot;necessary&quot; does not itself exempt it from the PDPA. This platform separately asks for optional analytics consent.</p>
      </> },
      { id: "usage", title: "How Data Is Used", content: <ul>
        <li>Provide accounts, invitations, recovery, and organization access.</li><li>Create, deliver, display, verify, and manage credential status.</li>
        <li>Prevent misuse, investigate failures, and maintain audit trails.</li><li>Respond to enquiries and meet applicable legal obligations.</li>
        <li>Understand optional platform usage when analytics consent is given. Optional analytics is not required for authentication or verification.</li>
      </ul> },
      { id: "providers", title: "Third-Party Services", content: <ul>
        <li><strong>Supabase:</strong> database, authentication, and associated service storage.</li>
        <li><strong>Vercel:</strong> application hosting and delivery infrastructure.</li>
        <li><strong>Resend:</strong> transactional email delivery where configured, including SMTP delivery for account emails.</li>
        <li>Public blockchain, RPC, and issuer document services may receive network requests needed to check credentials. A connected wallet is a separate provider governed by its own terms.</li>
      </ul> },
      { id: "storage", title: "Data Storage", content: <>
        <p>Data is held in configured service-provider infrastructure and, for preferences or downloaded credentials, your device. Provider locations and international transfers depend on deployment configuration; we do not promise Singapore-only storage.</p>
        <p>Where the PDPA Transfer Limitation Obligation applies, transfers must meet its requirements, including ensuring a standard of protection comparable to the PDPA through applicable legally enforceable obligations or another permitted mechanism. Provider names alone do not demonstrate compliance. Deployment-specific locations, contracts, onward transfers, and safeguards require verification before production legal sign-off. Ask our data protection contact about the applicable arrangements.</p>
      </> },
      { id: "retention", title: "Data Retention", content: <>
        <p>Account, credential, verification, and audit records are retained for service delivery, security, disputes, and applicable legal or issuer obligations. Under the PDPA, we must cease retaining documents containing personal data, or remove the means of associating that data with particular individuals, as soon as it is reasonable to assume that the original purpose is no longer served by retention and retention is no longer necessary for legal or business purposes.</p>
        <p>The PDPA does not prescribe one universal retention period. Category-specific schedules, justified legal holds, and deletion or anonymisation procedures must be established and reviewed; indefinite retention &quot;just in case&quot; is not justified. Deployment-specific schedules remain subject to operational confirmation.</p>
        <p>Backups and provider records must also be considered in retention arrangements. Deleting an account does not erase public blockchain transactions or copies already shared by others; those limitations do not remove retention obligations for personal data within our possession or control.</p>
      </> },
      { id: "security", title: "Security Measures", content: <p>We use access controls, tenant scoping, authentication, and restricted server-side handling of signing material to reduce risk. Keep account and wallet credentials secure, limit recipient information, and report suspected misuse promptly. No system or transmission method can be guaranteed completely secure.</p> },
      { id: "rights", title: "User Rights", content: <>
        <ul>
          <li><strong>Access:</strong> request personal data in our possession or control and information about how it has been or may have been used or disclosed in the year preceding your request, subject to statutory exceptions and proportionate identity verification.</li>
          <li><strong>Correction:</strong> request correction of errors or omissions. Applicable duties can include communicating corrections to organizations to which the data was disclosed in the preceding year, subject to the PDPA&apos;s conditions and exceptions.</li>
          <li><strong>Withdrawal:</strong> withdraw consent for specified collection, use, or disclosure by giving reasonable notice to <a href="mailto:dpo@verifiable.sg">dpo@verifiable.sg</a>. We will explain likely consequences. After withdrawal takes effect, collection, use, and disclosure based on that consent must cease, including by relevant data intermediaries and agents, unless otherwise required or authorised by law. Existing records remain subject to retention obligations; withdrawal is not an automatic instruction to erase every record.</li>
          <li><strong>Deletion requests:</strong> you may ask us to delete data. Singapore&apos;s PDPA does not provide an unconditional general right to erasure. We assess the request against retention obligations, applicable law, and the actual processing arrangement, and explain applicable limitations.</li>
          <li>Change optional analytics choices immediately through Cookie Preferences without losing necessary platform functionality. Contact your issuer about inaccurate certificates; revocation does not erase downloaded credentials or blockchain records.</li>
          <li>Where GDPR applies, additional rights may include erasure, restriction, objection, portability, and a complaint to the relevant supervisory authority, subject to applicable conditions. These are not presented as unconditional Singapore PDPA rights.</li>
        </ul>
        <p>Send access or correction requests to <a href="mailto:dpo@verifiable.sg">dpo@verifiable.sg</a>. Requests must be handled as soon as reasonably possible. If we cannot respond within 30 days after receiving a request, we must notify you in writing within that period of when a response can be expected, in accordance with applicable requirements. We may seek proportionate clarification or identity verification and explain applicable exceptions or any permitted access fee before charging it.</p>
        <p>You may raise a concern with our data protection contact. If it remains unresolved, you may contact Singapore&apos;s <a href="https://www.pdpc.gov.sg/">Personal Data Protection Commission (PDPC)</a>.</p>
      </> },
      { id: "consent", title: "Notification and Consent", content: <p>Collection, use, and disclosure must be for reasonable purposes notified at or before collection, or otherwise as required by the PDPA, with valid consent, deemed consent where applicable, or an applicable legal exception. Accepting account terms or acknowledging this policy is not blanket consent to unrelated processing. New purposes require the applicable notification and consent assessment; optional analytics remains a separate choice.</p> },
      { id: "pdpa", title: "Singapore PDPA Compliance", content: <p>We aim to handle personal data in line with Singapore&apos;s Personal Data Protection Act (PDPA), including notification, consent or applicable exceptions, purpose limitation, protection, accuracy, retention limitation, access/correction, transfer safeguards, and accountability. We assess suspected breaches and applicable notification duties. This policy and cookie controls alone are not a certification of compliance; organizational practices and contracts must also meet applicable requirements.</p> },
      { id: "contact", title: "Contact Information", content: <p>Send privacy, correction, deletion, or data-protection enquiries to <a href="mailto:dpo@verifiable.sg">dpo@verifiable.sg</a>. Include enough information to identify your request, but do not send passwords, private keys, reset links, or unnecessary certificate data. Operator company information is listed on the <a href="/contact">Contact page</a> and must be completed before production legal sign-off.</p> },
    ]}
  />;
}
