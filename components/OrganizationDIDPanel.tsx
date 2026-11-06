"use client";

import { useEffect,useState } from "react";
import { useWorkspaceSession } from "./WorkspaceSession";
import { isPlatformAdmin } from "../lib/permissions";
import { withBasePath } from "../lib/site";
import { managedDocumentURL } from "../lib/managed-did-urls";
import type { ManagedDIDDocument } from "../lib/managed-did";
import SelfManagedDIDPanel from "./SelfManagedDIDPanel";

interface Identity {
  id:string;organizationId:string;did:string;status:string;method:string;hostingMode:string;
  document:ManagedDIDDocument;createdAt:string;updatedAt:string;
}
interface Method {
  id:string;issuer_id:string;verification_method:string;key_fingerprint:string;key_version:number;status:string;
}
export default function OrganizationDIDPanel() {
  const {user}=useWorkspaceSession();
  const [identities,setIdentities]=useState<Identity[]>([]);
  const [selected,setSelected]=useState("");
  const [methods,setMethods]=useState<Method[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [downloading,setDownloading]=useState(false);
  const platform=!!user && isPlatformAdmin(user);
  useEffect(()=>{
    setIdentities([]);setSelected("");setMethods([]);
    if (!user) {setLoading(false);return;}
    const controller=new AbortController();
    setLoading(true);setError(null);
    const query=platform?"all":user.organizationId;
    void fetch(withBasePath(`/api/managed-dids?organizationId=${encodeURIComponent(query)}`),{signal:controller.signal,cache:"no-store"})
      .then(async response=>{
        const payload=await response.json();
        if (!response.ok) throw new Error(payload.error||"Unable to load organization DIDs.");
        if (!controller.signal.aborted) {
          setIdentities(payload.identities);
          setSelected(payload.identities[0]?.organizationId||"");
        }
      }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Unable to load organization DIDs.");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[user?.id,user?.organizationId,platform]);
  useEffect(()=>{
    setMethods([]);
    if (!selected) return;
    const controller=new AbortController();
    void fetch(withBasePath(`/api/managed-dids/methods?organizationId=${encodeURIComponent(selected)}`),{signal:controller.signal,cache:"no-store"})
      .then(async response=>{
        const payload=await response.json();
        if (!response.ok) throw new Error(payload.error||"Unable to load assigned verification methods.");
        if (!controller.signal.aborted)setMethods(payload.methods);
      }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Unable to load verification methods.");});
    return()=>controller.abort();
  },[selected]);
  const identity=identities.find(item=>item.organizationId===selected);
  const issuerCount=identity?new Set(identity.document.verificationMethod.map(method=>
    /#issuer-(.+)-key-[0-9]+$/.exec(method.id)?.[1])).size:0;
  const download=async()=>{
    if (!identity || downloading) return;
    setDownloading(true);setError(null);
    let url:string|undefined;
    let anchor:HTMLAnchorElement|undefined;
    try {
      const response=await fetch(withBasePath(`/api/managed-dids/download?organizationId=${encodeURIComponent(identity.organizationId)}`),{method:"POST",cache:"no-store"});
      if (!response.ok) {const payload=await response.json();throw new Error(payload.error||"Unable to download DID document.");}
      const blob=await response.blob();
      url=URL.createObjectURL(blob);anchor=document.createElement("a");
      anchor.href=url;anchor.download="did.json";document.body.appendChild(anchor);anchor.click();
    }catch(reason){setError(reason instanceof Error?reason.message:"Unable to download DID document.");}
    finally{anchor?.remove();if(url)URL.revokeObjectURL(url);setDownloading(false);}
  };
  if (!user) return <p className="text-sm text-slate-600">Sign in to view your organization identity.</p>;
  return <section className="space-y-6" aria-label="Managed organization identity">
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {loading?<p role="status">Loading organization identities...</p>:identities.length===0?
      <p className="rounded-xl border border-slate-200 p-5 text-sm">No managed DID is available. Contact your platform administrator to check the managed DID migration.</p>:null}
    {platform&&identities.length>0&&<label className="block text-sm font-semibold">Organization DID
      <select className="input-field mt-2 w-full" value={selected} onChange={event=>{setSelected(event.target.value);setError(null);}}>
        {identities.map(item=><option key={item.id} value={item.organizationId}>{item.did}</option>)}
      </select>
    </label>}
    {identity&&<>
      <SelfManagedDIDPanel key={identity.organizationId} organizationId={identity.organizationId} />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-bold">Managed DID</h2>
        <p className="mt-3 break-all font-mono text-sm">{identity.did}</p>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          {[["Status",identity.status],["Method",identity.method],["Hosting mode",identity.hostingMode],
            ["Issuers (including historical)",String(issuerCount)],["Verification methods",String(identity.document.verificationMethod.length)],
            ["Created",new Date(identity.createdAt).toLocaleDateString()]].map(([label,value])=><div key={label}>
              <dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd>
            </div>)}
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn-primary" disabled={downloading} onClick={()=>void download()}>{downloading?"Downloading...":"Download did.json"}</button>
          <a className="btn-secondary" href={managedDocumentURL(identity.did)} target="_blank" rel="noreferrer">View public document</a>
        </div>
      </div>
      <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
        <h2 className="font-bold">Verification methods available to your role</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Each method belongs to one issuer key. Inactive methods remain published for historical verification; they cannot issue new credentials.</p>
        {methods.length===0?<p className="mt-4 text-sm">No assigned issuer verification methods.</p>:<ul className="mt-4 space-y-3">
          {methods.map(method=><li key={method.id} className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
            <p className="break-all font-mono">{method.verification_method}</p>
            <p className="mt-2 break-all">Fingerprint: {method.key_fingerprint}</p>
            <p className="mt-1">Version {method.key_version} - {method.status}</p>
          </li>)}
        </ul>}
      </section>
      <details className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
        <summary className="cursor-pointer font-semibold">Raw DID document (public keys only)</summary>
        <pre className="mt-4 max-h-[32rem] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(identity.document,null,2)}</pre>
      </details>
      <p className="text-sm text-slate-600 dark:text-slate-400">The managed identity remains read-only and available for historical verification even when customer-hosted issuance is selected. Existing credentials and legacy DID URLs remain unchanged.</p>
    </>}
  </section>;
}
