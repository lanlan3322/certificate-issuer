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
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [messages, isThinking]);
  const submit = (event: FormEvent) => { event.preventDefault(); if (!value.trim() || isThinking) return; onSend(value.trim()); setValue(""); };
  return (
    <section aria-label="Credential workspace assistant" className="fixed bottom-4 right-4 z-[60] flex h-[min(640px,calc(100dvh-6rem))] w-[calc(100vw-2rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:right-6">
      <header className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white dark:border-slate-700">
        <div><p className="text-sm font-semibold">Issuer Success Agent</p><p className="text-xs text-cyan-200">Context: {page}</p></div>
        <button type="button" onClick={onClose} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Close Issuer Success Agent"><X aria-hidden="true" className="h-5 w-5" /></button>
      </header>
      <div ref={scrollRef} aria-live="polite" aria-relevant="additions text" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain break-words bg-slate-50 p-4 dark:bg-slate-950">
        {messages.map((message) => <AgentMessage key={message.id} message={message} onAction={(index) => message.actions?.[index] && onAction(message.actions[index])} />)}
        {isThinking && <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>}
      </div>
      <AgentSuggestions page={page} onSelect={onSend} />
      <p className="px-4 pb-2 text-[11px] text-slate-500 dark:text-slate-400">
        Send <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">/exit</span> to restart a new session.
      </p>
      <form onSubmit={submit} className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
        <input aria-label="Message to the assistant" name="assistant-message" autoComplete="off" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ask about issuing, DID, or verification" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        <button aria-label="Send message" type="submit" disabled={isThinking || !value.trim()} className="icon-button bg-cyan-600 text-white disabled:opacity-50"><ArrowUp className="h-5 w-5" aria-hidden="true" /></button>
      </form>
    </section>
  );
}