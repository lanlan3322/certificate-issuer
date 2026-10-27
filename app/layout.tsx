import type { Metadata } from "next";
import Footer from "../components/Footer";
import NavBar from "../components/NavBar";
import SiteChrome from "../components/SiteChrome";
import AuthEmailRedirect from "../components/AuthEmailRedirect";
import AgentWidget from "../components/agent/AgentWidget";
import { getCurrentIssuerUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verifiable | Verifiable Credentials Platform",
  description:
    "TrustVC is a secure credential platform for issuing, verifying, and governing W3C verifiable credentials across enterprise and public sector workflows.",
  keywords: [
    "Verifiable",
    "TrustVC",
    "verifiable credentials",
    "certificate platform",
    "DID",
    "digital trust",
    "W3C",
    "enterprise credentials",
    "credential verification",
  ],
};

const THEME_STORAGE_KEY = "trustvc-theme";

// Runs before first paint so the saved/OS theme never flashes light-then-dark.
const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})()`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentIssuerUser();
  const hasIssuerAdminRole = user?.roles.includes("issuer-admin") ?? false;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <AuthEmailRedirect />
        <SiteChrome header={<NavBar agentAvailable={Boolean(user)} />} footer={<Footer />} widget={hasIssuerAdminRole ? <AgentWidget /> : null}>
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}