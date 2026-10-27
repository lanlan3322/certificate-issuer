import Link from "next/link";

export default function UserManualPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10 text-slate-800">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-700">Documentation</p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">User Manual</h1>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-sm leading-7 text-slate-700">
        <p>Use the Issue page to create certificates with either DID or Ethereum issuance.</p>
        <p className="mt-4">Overview always shows the public platform introduction, whether you are logged in or not. Signed-in users can open Dashboard from eServices to view and manage issued certificates.</p>
        <p className="mt-4">Select My Profile beside Issue certificate on the dashboard to view your account details and edit your display name. Email, roles, and organization/issuer assignments are read-only. Reset password sends instructions to your registered email. The Organization menu in eServices is visible only to platform-admin users.</p>
        <p className="mt-4">For DID issuance, ensure the signing configuration is valid and review the resulting proof before sending the credential.</p>
        <p className="mt-4">Template Style lists active saved templates owned by issuers in your organization. Platform admins can select any active saved template, including templates from other organizations. This applies to single and batch issuance. If none are available, ask an administrator to save a template under an issuer in your organization; issuance is disabled until one is available.</p>
        <p className="mt-4">Sharing a template shares its style, not its owner&apos;s signing identity, Document Store, or certificate permissions. Your own template&apos;s signing-profile mapping still applies; shared templates use the existing default signing configuration and remain owned by your logged-in issuer. Saved template IDs are recorded separately from visual styles. The current renderer supports classic, modern, minimal, and fta slugs; other slugs retain the classic layout. Existing issued certificates and verification are unchanged. New issuance must reference an available saved template, rather than an unsaved built-in style.</p>
        <p className="mt-4">For Ethereum issuance, connect MetaMask, switch to Sepolia, confirm the wallet has ETH, and approve the transaction.</p>
        <p className="mt-4">Use the Verify page to check a credential’s validity, signature, and revocation state before sending or accepting it.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Back to docs</Link>
          <Link href="/verify" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400">Open verify</Link>
        </div>
      </div>
    </main>
  );
}
