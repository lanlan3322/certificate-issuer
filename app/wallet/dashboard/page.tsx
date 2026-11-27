"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import CertificateTemplateRenderer from "../../templates/CertificateTemplateRenderer";
import { toCertificateTemplateData } from "../../renderer/certificateView";
import { downloadCertificatePdf } from "../../../components/CertificatePdfDownload";
import { buildVerificationUrl, withBasePath } from "../../../lib/site";
import { getSupabaseBrowserClient } from "../../../lib/supabase/client";
import { mapVcToCertEntry } from "../../../lib/credential-mapper";
import type { WalletRecord, WalletStatus } from "../../../lib/wallet";

type Profile = { full_name: string; phone: string | null; country: string | null };
type WalletData = { userId: string; email: string; profile: Profile | null; credentials: WalletRecord[] };
type Detail = { credential: WalletRecord; document: Record<string, unknown> };
const date = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleDateString() : "Not recorded";

export default function WalletDashboardPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<WalletStatus | "all">("all");
  const [profile, setProfile] = useState({ fullName: "", phone: "", country: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const paper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(withBasePath("/api/wallet"), { cache: "no-store" });
        if (response.status === 401) {
          window.location.assign(withBasePath("/wallet/access/"));
          return;
        }
        const body = await response.json() as WalletData & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Unable to load your wallet.");
        if (!active) return;
        setWallet(body);
        setProfile({ fullName: body.profile?.full_name ?? "", phone: body.profile?.phone ?? "", country: body.profile?.country ?? "" });
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load your wallet.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!wallet) return;
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === "SIGNED_OUT") {
        setWallet(null); setDetail(null);
        window.location.assign(withBasePath("/wallet/access/"));
      } else if ((event === "SIGNED_IN" || event === "USER_UPDATED") &&
        (session?.user.id !== wallet.userId || session.user.email?.toLowerCase() !== wallet.email.toLowerCase())) {
        setWallet(null); setDetail(null);
        window.location.reload();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [wallet]);

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(withBasePath(url), { cache: "no-store", ...init });
    const body = await response.json() as { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Wallet request failed.");
    return body;
  }

  async function view(id: string) {
    setError(""); setNotice("");
    try {
      const response = await fetch(withBasePath(`/api/wallet?credential=${encodeURIComponent(id)}`), { cache: "no-store" });
      const body = await response.json() as Detail & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to view credential.");
      setQrVisible(false);
      setDetail(body);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to view credential."); }
  }

  async function recordAction(id: string, action: "credential.downloaded" | "credential.shared" | "credential.qr_generated") {
    await request("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    try {
      await request("/api/wallet", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      if (wallet) setWallet({ ...wallet, profile: { full_name: profile.fullName.trim(), phone: profile.phone.trim(), country: profile.country.trim() } });
      setNotice("Profile updated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update profile."); }
  }

  async function download(format: "pdf" | "json") {
    if (!detail) return;
    setError(""); setNotice("");
    try {
      if (format === "pdf") {
        if (!paper.current) throw new Error("Certificate preview is unavailable.");
        await downloadCertificatePdf(paper.current, detail.credential.recipientName);
      } else {
        const url = URL.createObjectURL(new Blob([JSON.stringify(detail.document, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url; link.download = "credential.json"; link.click();
        URL.revokeObjectURL(url);
      }
      await recordAction(detail.credential.id, "credential.downloaded");
      setNotice("Download started.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to download credential."); }
  }

  async function share() {
    if (!detail) return;
    setError(""); setNotice("");
    try {
      await navigator.clipboard.writeText(buildVerificationUrl(window.location.origin, detail.credential.externalId));
      await recordAction(detail.credential.id, "credential.shared");
      setNotice("Verification link copied.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to copy the link."); }
  }

  async function generateQr() {
    if (!detail) return;
    setError(""); setNotice("");
    try {
      await recordAction(detail.credential.id, "credential.qr_generated");
      setQrVisible(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to generate QR code."); }
  }

  async function signOut() {
    setError("");
    const { error: authError } = await getSupabaseBrowserClient().auth.signOut();
    if (authError) { setError(authError.message); return; }
    window.location.assign(withBasePath("/wallet/"));
  }

  const visible = (wallet?.credentials ?? []).filter((item) => {
    const term = query.trim().toLowerCase();
    return (status === "all" || item.status === status) &&
      (!term || [item.title, item.issuer, item.organization].some((text) => text.toLowerCase().includes(term)));
  });
  const years = [...new Set(visible.map((item) => Number.isFinite(Date.parse(item.issuedAt)) ? String(new Date(item.issuedAt).getFullYear()) : "Unknown year"))];

  return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Professional Credential Passport</p>
        <h1 className="mt-2 text-3xl font-bold">My wallet</h1>
        {wallet && <p className="mt-2 break-all text-sm text-slate-500">{wallet.email}</p>}</div>
      <button type="button" className="btn-secondary" onClick={() => void signOut()}>Sign out</button>
    </header>
    {loading && <p role="status" className="mt-6">Loading your wallet...</p>}
    {error && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {notice && <p role="status" className="mt-6 rounded-lg bg-emerald-50 p-3 text-emerald-800">{notice}</p>}
    {wallet && <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Total credentials", String(wallet.credentials.length)],
          ["Memberships", "Not available"],
          ["CPD records", "Not available"],
          ["Professional standing", "Unknown"],
        ].map(([label, value]) => <section key={label} className="card"><h2 className="text-sm text-slate-500">{label}</h2><p className="mt-2 text-xl font-bold">{value}</p></section>)}
      </div>
      <nav aria-label="Wallet sections" className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
        <a href="#credentials">My credentials</a><a href="#memberships">My memberships</a><a href="#certifications">My certifications</a><a href="#cpd">My CPD</a><a href="#timeline">Timeline</a><a href="#professional-profile">Professional profile</a><a href="#profile">Edit profile</a><a href="#professional-data">Professional standing</a>
      </nav>
      <section id="credentials" className="mt-8">
        <h2 className="text-2xl font-bold">My credentials</h2>
        <p className="mt-2 text-sm text-slate-500">Status is the issuer&apos;s recorded status, not a fresh verification. Open the verification link to check.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Search credentials, organizations or issuers<input type="search" className="input-field mt-1" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label className="text-sm">Status<select className="input-field mt-1" value={status} onChange={(event) => setStatus(event.target.value as WalletStatus | "all")}>
            {["all", "active", "not_yet_valid", "expired", "revoked", "suspended", "unknown"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
          </select></label>
        </div>
        {!visible.length && <p className="mt-4 text-sm text-slate-500">No matching credentials found.</p>}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {visible.map((item) => <article key={item.id} className="card min-w-0">
            <h3 className="break-words text-lg font-bold">{item.title}</h3>
            <p className="mt-2 break-words text-sm">{item.issuer} · {item.organization}</p>
            <p className="mt-2 text-sm text-slate-500">Issued {date(item.issuedAt)} · Expires {date(item.validUntil)}</p>
            <p className="mt-2 text-sm font-semibold capitalize">{item.status.replaceAll("_", " ")}</p>
            <div className="mt-4 flex flex-wrap gap-3"><button type="button" className="btn-primary" onClick={() => void view(item.id)}>View credential</button>
              <Link href={`/verify/?id=${encodeURIComponent(item.externalId)}`} className="btn-secondary">Verify</Link></div>
          </article>)}
        </div>
      </section>
      {detail && <section className="mt-8 card" aria-label="Credential details">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">{detail.credential.title}</h2><button className="btn-secondary" onClick={() => setDetail(null)}>Close</button></div>
        <div ref={paper} className="certificate-paper mt-4 overflow-auto bg-white text-slate-900">
          <CertificateTemplateRenderer certificate={{
            ...(mapVcToCertEntry(detail.document) ?? toCertificateTemplateData(detail.document, window.location.origin)),
            id: detail.credential.externalId, recipientName: detail.credential.recipientName,
            verificationUrl: buildVerificationUrl(window.location.origin, detail.credential.externalId),
          }} verificationFooterUrl={buildVerificationUrl(window.location.origin, detail.credential.externalId)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="btn-primary" onClick={() => void download("pdf")}>Download PDF</button>
          <button className="btn-secondary" onClick={() => void download("json")}>Download signed JSON</button>
          <button className="btn-secondary" onClick={() => void share()}>Copy verification link</button>
          <button className="btn-secondary" onClick={() => void generateQr()}>Generate QR code</button>
        </div>
        {qrVisible && <div className="mt-4 inline-block bg-white p-3"><QRCodeSVG value={buildVerificationUrl(window.location.origin, detail.credential.externalId)} size={128} aria-label="Verification link QR code" /></div>}
        <p className="mt-2 text-sm text-slate-500">Sharing this link allows others to check the credential&apos;s public verification result.</p>
      </section>}
      <section id="timeline" className="mt-8 card"><h2 className="text-2xl font-bold">Credential timeline</h2>
        {years.map((year) => <div key={year} className="mt-4"><h3 className="font-bold">{year}</h3><ul className="mt-2 list-inside list-disc">{visible.filter((item) => (Number.isFinite(Date.parse(item.issuedAt)) ? String(new Date(item.issuedAt).getFullYear()) : "Unknown year") === year).map((item) => <li key={item.id}>{item.title} — {item.issuer}</li>)}</ul></div>)}
        {!years.length && <p className="mt-2 text-sm text-slate-500">No credentials in this view.</p>}
      </section>
      <section className="mt-8 card"><h2 className="text-2xl font-bold">Recent activity</h2>
        <p className="mt-2 text-sm text-slate-500">Recently issued credentials; this is not an activity audit log.</p>
        <ul className="mt-3 space-y-2">{wallet.credentials.slice(0, 5).map((item) => <li key={item.id} className="text-sm">{date(item.issuedAt)} — {item.title}</li>)}</ul>
        {!wallet.credentials.length && <p className="mt-2 text-sm text-slate-500">No credentials issued to this email.</p>}
      </section>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[["memberships", "My memberships"], ["certifications", "My certifications"], ["cpd", "My CPD"]].map(([id, title]) =>
          <section id={id} key={id} className="card"><h2 className="text-xl font-bold">{title}</h2><p className="mt-2 text-sm text-slate-500">Authoritative data is not connected yet.</p></section>)}
      </div>
      <section id="professional-data" className="mt-8 card"><h2 className="text-2xl font-bold">Professional standing</h2><p className="mt-2 text-sm text-slate-500">Membership, certification and CPD data and compliance rules are not connected. Standing is unknown, not a determination of good standing.</p></section>
      <section id="professional-profile" className="mt-8 card"><h2 className="text-2xl font-bold">Professional profile</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Name</dt><dd className="break-words font-semibold">{wallet.profile?.full_name || "Not provided"}</dd></div>
          <div><dt className="text-slate-500">Credential count</dt><dd className="font-semibold">{wallet.credentials.length}</dd></div>
          <div><dt className="text-slate-500">Memberships and certifications</dt><dd>Not available</dd></div>
          <div><dt className="text-slate-500">Verification</dt><dd>Check each credential individually</dd></div>
        </dl>
        <p className="mt-4 text-sm text-slate-500">Public profile sharing is not available.</p>
      </section>
      <section id="profile" className="mt-8 card"><h2 className="text-2xl font-bold">My profile</h2>
        <form onSubmit={(event) => void saveProfile(event)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Full name<input className="input-field mt-1" maxLength={200} value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} /></label>
          <label className="text-sm">Phone<input className="input-field mt-1" maxLength={50} value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label>
          <label className="text-sm">Country<input className="input-field mt-1" maxLength={100} value={profile.country} onChange={(event) => setProfile({ ...profile, country: event.target.value })} /></label>
          <div className="sm:col-span-2"><button className="btn-primary">Save profile</button></div>
        </form>
      </section>
    </>}
  </main>;
}
