"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, X } from "lucide-react";
import AgentMessage from "./AgentMessage";
import AgentSuggestions from "./AgentSuggestions";
import type { AgentAction, AgentMessageData } from "../../lib/agent/types";

interface AgentWindowProps {
  page: string;
  messages: AgentMessageData[];
  isThinking: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
  onAction: (action: AgentAction) => void;
}

export default function AgentWindow({ page, messages, isThinking, onClose, onSend, onAction }: AgentWindowProps) {
  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, isThinking]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!value.trim() || isThinking) return; onSend(value.trim()); setValue(""); };
  return (
    <section className="fixed bottom-24 right-4 z-[60] flex h-[min(640px,calc(100vh-7rem))] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:right-6">
      <header className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white dark:border-slate-700">
        <div><p className="text-sm font-semibold">Issuer Success Agent</p><p className="text-xs text-cyan-200">Context: {page}</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-white/10" aria-label="Close Issuer Success Agent"><X className="h-5 w-5" /></button>
      </header>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">
        {messages.map((message) => <AgentMessage key={message.id} message={message} onAction={(index) => message.actions?.[index] && onAction(message.actions[index])} />)}
        {isThinking && <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>}
      </div>
      <AgentSuggestions page={page} onSelect={onSend} />
      <form onSubmit={submit} className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
        <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ask about issuing, DID, or verification" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        <button type="submit" disabled={isThinking || !value.trim()} className="rounded-xl bg-cyan-600 p-2 text-white disabled:opacity-50"><ArrowUp className="h-5 w-5" /></button>
      </form>
    </section>
  );
}