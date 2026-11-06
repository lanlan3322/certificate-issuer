import { MarketingIndex } from "../../components/MarketingPage";
import { publicMetadata, solutions } from "../../lib/marketing";

export const metadata = publicMetadata("/solutions", "Digital Credential Solutions", "Credential management for training providers, associations, universities, corporate learning and certification bodies.");
export default function SolutionsPage() {
  return <MarketingIndex title="Digital credentials for your community" description="Connect organizational identity, professional achievements and verifiable trust across your credential programme." base="/solutions" entries={solutions} />;
}
