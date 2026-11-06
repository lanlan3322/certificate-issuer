import type { Metadata } from "next";
import LegalPage from "../../components/legal/LegalPage";
import { publicMetadata } from "../../lib/marketing";

export const metadata: Metadata = publicMetadata("/contact", "Contact Us", "Book a demo, start a free consultation or talk to sales about your organization's credential programme. Support: support@verifiable.sg.");

export default function ContactPage() {
  return <LegalPage
    title="Contact Us"
    introduction="Contact support@verifiable.sg for all support, privacy, data-protection, and business enquiries."
    sections={[
      { id: "demo", title: "Book Demo", content: <><p>Explore organization governance, issuer identity and the credential lifecycle with our team.</p><p><a href="mailto:support@verifiable.sg?subject=Verifiable.sg%20demo%20request">Request a demo by email</a>. Include your organization, programme goals and preferred times.</p><p>This opens your email app; it does not reserve a meeting. Our team will confirm availability with you.</p></> },
      { id: "consultation", title: "Start Free Consultation", content: <><p>Discuss your credential programme, identity requirements and expected issuer and credential volumes.</p><p><a href="mailto:support@verifiable.sg?subject=Verifiable.sg%20free%20consultation%20request">Request a free consultation</a>. No payment information is needed to enquire.</p></> },
      { id: "sales", title: "Talk to Sales", content: <><p>Compare Starter, Professional and Enterprise for your organization&apos;s growth stage. Commercial arrangements are agreed with our team; online checkout is not connected.</p><p><a href="mailto:support@verifiable.sg?subject=Verifiable.sg%20sales%20enquiry">Contact sales</a>.</p></> },
      { id: "support", title: "Support Contact", content: <><p>Email <a href="mailto:support@verifiable.sg?subject=Support%20enquiry">support@verifiable.sg</a> with the page, approximate time, and non-sensitive error message.</p><p>Do not send passwords, authentication tokens, reset links, signing keys, or full certificates containing personal data. We will request any necessary diagnostic information through an appropriate channel.</p></> },
      { id: "privacy", title: "Privacy Contact", content: <><p>Send personal-data access, correction, deletion, consent-withdrawal, and data-protection enquiries to <a href="mailto:support@verifiable.sg?subject=Privacy%20enquiry">support@verifiable.sg</a>.</p><p>For questions about an issued credential&apos;s content, contact the issuing organization. See our <a href="/privacy">Privacy Policy</a> for handling practices and limitations.</p></> },
      { id: "business", title: "Business Enquiries", content: <p>For organization onboarding, integrations, and commercial discussions, email <a href="mailto:support@verifiable.sg?subject=Business%20enquiry">support@verifiable.sg</a>. This mailbox currently routes all enquiries.</p> },
      { id: "company", title: "About Us", content: <>
        <p>Verifiable.sg is a Credential-as-a-Service (CaaS) platform that enables organizations to issue, manage, revoke, and verify trusted digital credentials under their own brand. From professional certifications and memberships to training records and academic achievements, Verifiable.sg provides the infrastructure needed to build a secure and scalable credential ecosystem.</p>
        <p>Data protection contact: support@verifiable.sg. Legal operator registration and address details are pending publication; request current contracting information before entering an agreement.</p>
      </> },
    ]}
  />;
}
