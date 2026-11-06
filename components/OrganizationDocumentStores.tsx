"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspaceSession } from "./WorkspaceSession";
import { isPlatformAdmin, normalizeRoles } from "../lib/permissions";
import { withBasePath } from "../lib/site";

interface Store {
  id:string;network:string;contract_address:string;status:string;approved_by:string|null;
  connection_status:string;checked_at:string|null;validation_message:string|null;signer_address:string|null;created_at:string;
}
interface Organization {id:string;displayName:string}
export default function OrganizationDocumentStores() {
  const {user}=useWorkspaceSession();
  const platform=!!user&&isPlatformAdmin(user);
  const canManage=!!user&&(platform||normalizeRoles(user.roles).includes("organization_admin"));
  const [organizations,setOrganizations]=useState<Organization[]>([]);
  const [organizationId,setOrganizationId]=useState("");
  const [stores,setStores]=useState<Store[]>([]);
  const [address,setAddress]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const lock=useRef(false);
  useEffect(()=>{
    setOrganizationId(user?.organizationId??"");setStores([]);setError(null);setNotice(null);setAddress("");
    if(!platform){setOrganizations([]);return;}
    const controller=new AbortController();
    void fetch(withBasePath("/api/organizations"),{signal:controller.signal,cache:"no-store"})
      .then(async response=>{
        const body=await response.json();if(!response.ok)throw new Error(body.error||"Unable to load organizations.");
        if(!controller.signal.aborted)setOrganizations(body.organizations);
      }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Unable to load organizations.");});
    return()=>controller.abort();
  },[user?.id,user?.organizationId,platform]);
  useEffect(()=>{
    setStores([]);setAddress("");setNotice(null);
    if(!organizationId){setLoading(false);return;}
    const controller=new AbortController();setLoading(true);
    void fetch(withBasePath(`/api/organization-document-stores?organizationId=${encodeURIComponent(organizationId)}`),{signal:controller.signal,cache:"no-store"})
      .then(async response=>{
        const body=await response.json();if(!response.ok)throw new Error(body.error||"Unable to load Document Stores.");
        if(!controller.signal.aborted)setStores(body.stores);
      }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Unable to load Document Stores.");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[organizationId]);
  async function action(name:string,store?:Store) {
    if(!canManage||lock.current)return;
    if(["activate","deactivate","approve"].includes(name)&&!window.confirm(
      name==="approve"?"Approve this contract's assignment to this organization? Independently confirm ownership first. A connection test is not ownership proof.":
      name==="activate"?"Use this store for new credentials? Historical credentials keep their original store.":
      "Deactivate this store? New issuance will return to its existing template-profile or platform legacy store. Historical credentials keep their original store."
    ))return;
    lock.current=true;setBusy(true);setError(null);setNotice(null);
    try {
      const response=await fetch(withBasePath(`/api/organization-document-stores?organizationId=${encodeURIComponent(organizationId)}`),{
        method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:name,...(name==="add"?{address,network:"sepolia"}:{storeId:store?.id})}),
      });
      const body=await response.json();
      if(!response.ok){
        const refreshed=await fetch(withBasePath(`/api/organization-document-stores?organizationId=${encodeURIComponent(organizationId)}`),{cache:"no-store"});
        if(refreshed.ok)setStores((await refreshed.json()).stores);
        throw new Error(body.error||"Document Store action failed.");
      }
      setStores(body.stores);setAddress("");
      setNotice(name==="test"?"Connection and server wallet roles verified. No transaction was sent.":"Document Store configuration updated.");
    }catch(reason){setError(reason instanceof Error?reason.message:"Document Store action failed.");}
    finally{lock.current=false;setBusy(false);}
  }
  if(!user)return <p>Sign in to manage organization Document Stores.</p>;
  return <section className="space-y-5" aria-label="Organization Document Stores">
    {platform&&<label className="block text-sm font-semibold">Organization
      <select className="input-field mt-2 w-full" value={organizationId} disabled={busy} onChange={event=>{setError(null);setOrganizationId(event.target.value);}}>
        <option value="">Select an organization</option>
        {organizations.map(org=><option key={org.id} value={org.id}>{org.displayName}</option>)}
      </select>
    </label>}
    <p className="text-sm text-slate-600 dark:text-slate-400">
      Organization stores override template-profile and platform legacy stores for new credentials. Each credential keeps its issuance-time contract for verification and revocation.
      Organization-owned stores use the platform transaction wallet for server-issued credentials and revocation. Legacy store selection retains its existing wallet-based issuance.
    </p>
    <p className="text-sm">New contracts: Sepolia only. No contract deployment, wallet secrets or gas-spending connection tests.</p>
    {loading&&<p role="status">Loading Document Stores...</p>}
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {canManage&&organizationId&&<form className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700" onSubmit={event=>{event.preventDefault();void action("add");}}>
      <h2 className="text-lg font-bold">Add Document Store</h2>
      <label htmlFor="store-address" className="block text-sm font-semibold">Sepolia contract address</label>
      <input id="store-address" className="input-field w-full font-mono" autoComplete="off" spellCheck={false} required maxLength={42}
        placeholder="0x..." value={address} disabled={busy||loading} onChange={event=>setAddress(event.target.value)} />
      <p className="text-xs text-slate-500">A platform administrator must approve ownership before activation. Grant the server wallet ISSUER_ROLE and REVOKER_ROLE on an AccessControl-compatible OpenAttestation Document Store.</p>
      <button className="btn-primary min-h-11" disabled={busy||loading||!address.trim()}>Add Document Store</button>
    </form>}
    {!loading&&organizationId&&!stores.some(store=>store.status==="active")&&<p className="text-sm">No active organization store. Existing template-profile / platform legacy store selection is retained.</p>}
    <ul className="space-y-4">{stores.map(store=><li key={store.id} className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <h2 className="break-all font-mono text-sm font-bold">{store.contract_address}</h2>
      <p className="text-sm">Network: {store.network}. Status: {store.status}. Ownership: {store.approved_by?"Approved":"Pending platform approval"}.</p>
      <p className="text-sm">Connection: {store.connection_status}{store.checked_at?` (${new Date(store.checked_at).toLocaleString()})`:" - not tested"}.</p>
      {store.validation_message&&<p className="text-sm">{store.validation_message}</p>}
      {store.signer_address&&<p className="break-all text-xs">Server wallet: {store.signer_address}</p>}
      <p className="text-xs">Added: {new Date(store.created_at).toLocaleString()}</p>
      {canManage&&<div className="flex flex-wrap gap-2">
        {platform&&!store.approved_by&&<button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={()=>void action("approve",store)}>Approve ownership assignment</button>}
        <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={()=>void action("test",store)}>Test Connection</button>
        <button type="button" className="btn-primary min-h-11" disabled={busy||!store.approved_by} onClick={()=>void action("activate",store)}>Set Active Store</button>
        {store.status==="active"&&<button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={()=>void action("deactivate",store)}>Deactivate Store</button>}
      </div>}
    </li>)}</ul>
  </section>;
}
