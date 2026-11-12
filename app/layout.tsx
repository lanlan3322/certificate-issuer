import type { Metadata } from "next";
import Footer from "../components/Footer";
import NavBar from "../components/NavBar";
import SiteChrome from "../components/SiteChrome";
import AuthEmailRedirect from "../components/AuthEmailRedirect";
import AgentWidget from "../components/agent/AgentWidget";
import CookieBanner from "../components/legal/CookieBanner";
import { getCurrentIssuerUser } from "@/lib/auth";
import { WorkspaceSessionProvider } from "../components/WorkspaceSession";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verifiable.sg | Credential-as-a-Service",
  description:
    "Verifiable.sg is a Credential-as-a-Service (CaaS) platform that helps organizations issue, manage, revoke, and verify branded digital credentials.",
  keywords: [
    "Verifiable.sg",
    "Credential-as-a-Service",
    "CaaS",
    "verifiable credentials",
    "digital credentials",
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

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <WorkspaceSessionProvider initialUser={user}>
          <AuthEmailRedirect />
          <SiteChrome header={<NavBar />} footer={<Footer />} widget={<AgentWidget />}>
            {children}
          </SiteChrome>
          <CookieBanner />
        </WorkspaceSessionProvider>
      </body>
    </html>
  );
}