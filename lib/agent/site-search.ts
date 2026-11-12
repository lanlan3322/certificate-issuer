import { capabilities, resourcePages, solutions } from "../marketing";
import { publicNavigation, workspaceNavigation } from "../navigation";
import { hasPermission, type IssuerMembership, type Permission } from "../permissions";
import type { AgentResponse } from "./types";

type SearchUser = { roles: readonly string[]; issuerMemberships?: readonly IssuerMembership[] } | null;
type SearchPage = { href: string; label: string; description: string; aliases?: string[]; permission?: Permission };

const extraPages: SearchPage[] = [
  { href: "/issuer", label: "Workspace sign in", description: "Sign in to your organization's workspace" },
  { href: "/release-notes", label: "Release notes", description: "Product updates and changes" },
  { href: "/privacy", label: "Privacy policy", description: "How information is handled" },
  { href: "/terms", label: "Terms of service", description: "Terms for using Verifiable.sg" },
  { href: "/enterprise", label: "Enterprise", description: "Enterprise credential programmes" },
  { href: "/bulk", label: "Batch data preview", description: "Preview batch data without issuing credentials", permission: "credentials.issue" },
  { href: "/templates/builder", label: "Template builder", description: "Create and maintain credential templates", permission: "templates.manage" },
  { href: "/organization-did", label: "DID Management", description: "Configure organization identity and issuer methods", permission: "members.manage" },
  { href: "/did", label: "Issuer profiles", description: "Configure issuer profiles and DID identity", permission: "issuers.manage" },
  { href: "/wallet", label: "Sharing and delivery", description: "Share credentials with recipients" },
  { href: "/revocation", label: "Revocation Management", description: "Revoke, suspend or reinstate a credential", permission: "credentials.revoke" },
  { href: "/verification", label: "JSON inspector", description: "Inspect credential data without verification" },
];

const aliases: Record<string, string[]> = {
  "/dashboard": ["workspace home", "overview"],
  "/credentials": ["issued certificates", "issued credentials", "certificate records"],
  "/insurance": ["issue certificate", "issue credentials", "create certificate"],
  "/branding": ["credential templates", "certificate templates", "template designs"],
  "/admin": ["issuer management", "manage issuers"],
  "/verify": ["verify certificate", "verification portal"],
  "/profile": ["account settings", "my account"],
  "/docs/user-manual": ["user manual", "operator guide", "help guide"],
  "/docs/admin-manual": ["admin manual", "administrator guide"],
  "/resources/faqs": ["faq", "frequently asked questions"],
  "/billing": ["subscription", "plan usage"],
};

const stopWords = new Set("a an and are can could do for from i in is it me my of on page pages please search site the this to website where which how find locate open show take go access".split(" "));
const synonyms: Record<string, string> = {
  certificates: "certificate", credentials: "credential", issuers: "issuer", keys: "key",
  templates: "template", users: "user", organizations: "organization", guides: "guide",
  issuing: "issue", issuance: "issue", issued: "issue", verification: "verify",
  verifying: "verify", revocation: "revoke", revoked: "revoke", faqs: "faq",
};

function words(value: string) {
  return value.toLowerCase().match(/[a-z0-9]+/g)?.map((word) => synonyms[word] ?? word)
    .filter((word) => !stopWords.has(word)) ?? [];
}

function pagesFor(user: SearchUser): SearchPage[] {
  const marketing = [
    ...solutions.map((item) => ({ href: `/solutions/${item.slug}`, label: item.title, description: item.description })),
    ...capabilities.map((item) => ({ href: `/platform/${item.slug}`, label: item.title, description: item.description })),
    ...resourcePages.map((item) => ({ href: `/resources/${item.slug}`, label: item.title, description: item.description })),
  ];
  const pages = [
    ...publicNavigation,
    ...workspaceNavigation(user).flatMap((group) => group.items),
    ...extraPages.filter((page) => !page.permission || hasPermission(user, page.permission)),
    ...marketing,
  ];
  return [...new Map(pages.map((page) => [page.href, page])).values()];
}

export function searchSitePages(message: string, user: SearchUser): AgentResponse | null {
  if (!/\b(?:find|search|open|locate|navigate|where|which page|take me|show me|go to|access)\b/i.test(message)
      && !/\b(?:page|guide|manual)\b/i.test(message)) return null;

  const terms = [...new Set(words(message))];
  const query = terms.length > 1 ? terms.filter((word) => word !== "about") : terms;
  if (!query.length) return { message: "Tell me a page or topic to search for, such as billing or the user guide." };

  const matches = pagesFor(user).map((page) => {
    const titles = [page.label, ...(aliases[page.href] ?? []), ...(page.aliases ?? [])].map(words);
    const description = words(page.description);
    const titleWords = new Set(titles.flat());
    const score = query.reduce((total, word) => total + (titleWords.has(word) ? 5 : description.includes(word) ? 1 : 0), 0)
      + (titles.some((title) => title.length > 0 && title.every((word) => query.includes(word))) ? 4 : 0);
    return { page, score };
  }).filter(({ score }) => score >= 3)
    .sort((a, b) => b.score - a.score || a.page.label.localeCompare(b.page.label))
    .slice(0, 3);

  if (!matches.length) return { message: "I couldn't find a matching page available to you. Try another page name or topic." };
  return {
    message: `Select a page to open:\n${matches.map(({ page }) => `${page.label}: ${page.description}`).join("\n")}`,
    actions: matches.map(({ page }) => ({ type: "navigate", href: page.href, label: page.label })),
  };
}
