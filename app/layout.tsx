import type { Metadata } from "next";
import Footer from "../components/Footer";
import NavBar from "../components/NavBar";
import AgentWidget from "../components/agent/AgentWidget";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="flex min-h-screen flex-col">
          <NavBar />
          <div className="flex-1">{children}</div>
          <Footer />
          <AgentWidget />
        </div>
      </body>
    </html>
  );
}