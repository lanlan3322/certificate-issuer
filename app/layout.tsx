import type { Metadata } from "next";
import Footer from "../components/Footer";
import NavBar from "../components/NavBar";
import SiteChrome from "../components/SiteChrome";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentIssuerUser();
  const hasIssuerAdminRole = user?.roles.includes("issuer-admin") ?? false;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <SiteChrome header={<NavBar />} footer={<Footer />} widget={hasIssuerAdminRole ? <AgentWidget /> : null}>
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}