import { MarketingIndex } from "../../components/MarketingPage";
import { publicMetadata, resourcePages } from "../../lib/marketing";

export const metadata = publicMetadata("/resources", "Credential Resources", "Guides and answers for your organization's digital credential programme.");
export default function ResourcesPage() {
  return <MarketingIndex title="Resources for your credential programme" description="Start with practical documentation and common questions. Case studies, articles and whitepapers will follow when available." base="/resources" entries={resourcePages} />;
}
