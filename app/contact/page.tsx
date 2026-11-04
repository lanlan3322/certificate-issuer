import type { Metadata } from "next";
import LegalPage from "../../components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Contact Us | Verifiable.sg",
  description: "Contact Verifiable.sg for support, privacy and data-protection requests, business enquiries, and operator information.",
};

export default function ContactPage() {
  return <LegalPage
    title="Contact Us"
    introduction="Contact support@verifiable.sg for all support, privacy, data-protection, and business enquiries."
    sections={[
      { id: "support", title: "Support Contact", content: <><p>Email <a href="mailto:support@verifiable.sg?subject=Support%20enquiry">support@verifiable.sg</a> with the page, approximate time, and non-sensitive error message.</p><p>Do not send passwords, authentication tokens, reset links, signing keys, or full certificates containing personal data. We will request any necessary diagnostic information through an appropriate channel.</p></> },
      { id: "privacy", title: "Privacy Contact", content: <><p>Send personal-data access, correction, deletion, consent-withdrawal, and data-protection enquiries to <a href="mailto:support@verifiable.sg?subject=Privacy%20enquiry">support@verifiable.sg</a>.</p><p>For questions about an issued credential&apos;s content, contact the issuing organization. See our <a href="/privacy">Privacy Policy</a> for handling practices and limitations.</p></> },
      { id: "business", title: "Business Enquiries", content: <p>For organization onboarding, integrations, and commercial discussions, email <a href="mailto:support@verifiable.sg?subject=Business%20enquiry">support@verifiable.sg</a>. This mailbox currently routes all enquiries.</p> },
      { id: "company", title: "About Us", content: <>
        <p>Verifiable.sg is a Credential-as-a-Service (CaaS) platform that enables organizations to issue, manage, revoke, and verify trusted digital credentials under their own brand. From professional certifications and memberships to training records and academic achievements, Verifiable.sg provides the infrastructure needed to build a secure and scalable credential ecosystem.</p>
        <ul><li><strong>Legal entity name:</strong> </li><li><strong>Registration number / UEN:</strong> </li><li><strong>Registered business address:</strong>  .</li><li><strong>Data protection contact:</strong> support@verifiable.sg.</li></ul>
      </> },
    ]}
  />;
}
