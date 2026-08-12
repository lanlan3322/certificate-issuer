"use client";

import { useState } from "react";
import { Brush, Globe, Palette, ShieldCheck, Sparkles } from "lucide-react";

export default function BrandingPage() {
  const [brand, setBrand] = useState({
    issuerName: "OpenClaw Academy",
    website: "https://openclaw.example",
    themeColor: "#0f172a",
    accentColor: "#0ea5e9",
    description: "Trusted digital credentialing for learning and professional development.",
    verificationText: "Verified by OpenClaw Academy",
  });

  const previewStyle = {
    background: `linear-gradient(135deg, ${brand.themeColor}, ${brand.accentColor})`,
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">Branding</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">Issuer profile and verification brand</h1>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <Palette className="h-5 w-5 text-cyan-700" />
            <h2 className="text-xl font-semibold text-slate-900">Brand configuration</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Issuer name</label>
              <input
                value={brand.issuerName}
                onChange={(e) => setBrand({ ...brand, issuerName: e.target.value })}
                className="input-field"
              />
            </div>

            <div>
              <label className="label">Website</label>
              <input
                value={brand.website}
                onChange={(e) => setBrand({ ...brand, website: e.target.value })}
                className="input-field"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="label">Theme color</label>
                <input
                  type="color"
                  value={brand.themeColor}
                  onChange={(e) => setBrand({ ...brand, themeColor: e.target.value })}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white p-1"
                />
              </div>
              <div>
                <label className="label">Accent color</label>
                <input
                  type="color"
                  value={brand.accentColor}
                  onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white p-1"
                />
              </div>
            </div>

            <div>
              <label className="label">Issuer description</label>
              <textarea
                value={brand.description}
                onChange={(e) => setBrand({ ...brand, description: e.target.value })}
                className="input-field min-h-28"
              />
            </div>

            <div>
              <label className="label">Verification branding</label>
              <input
                value={brand.verificationText}
                onChange={(e) => setBrand({ ...brand, verificationText: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-700" />
            <h2 className="text-xl font-semibold text-slate-900">Live preview</h2>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5 shadow-sm" style={previewStyle}>
            <div className="flex items-center justify-between text-white/90">
              <div className="text-xs font-semibold uppercase tracking-[0.2em]">Issuer profile</div>
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="mt-6 rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur-sm">
              <div className="text-2xl font-bold text-white">{brand.issuerName}</div>
              <div className="mt-2 flex items-center gap-2 text-sm text-white/90">
                <Globe className="h-4 w-4" />
                {brand.website}
              </div>
              <p className="mt-4 text-sm leading-6 text-white/90">{brand.description}</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-slate-800">
              <Brush className="h-4 w-4 text-cyan-700" />
              <span className="text-sm font-semibold">Verification badge text</span>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700">
              {brand.verificationText}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
