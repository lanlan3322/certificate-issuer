import { MarketingIndex } from "../../components/MarketingPage";
import { capabilities, publicMetadata } from "../../lib/marketing";

export const metadata = publicMetadata("/platform", "Credential Infrastructure Platform", "Organization governance, issuer identity and credential lifecycle management in one Credential-as-a-Service platform.");
export default function PlatformPage() {
  return <MarketingIndex title="Your organization. Your identity. Trusted credentials." description="Digital trust infrastructure connecting organization governance, issuer identity and the complete credential lifecycle." base="/platform" entries={capabilities} />;
}
