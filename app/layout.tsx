import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IMDA Certificate Issuer | TrustVC",
  description:
    "Issue verifiable certificates using TrustVC, managed by IMDA. W3C Verifiable Credentials with on-chain verification.",
  keywords: [
    "certificate",
    "verifiable credentials",
    "TrustVC",
    "IMDA",
    "OpenCerts",
    "blockchain",
    "W3C",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}