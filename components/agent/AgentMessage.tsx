import { Bot, User } from "lucide-react";
import type { AgentMessageData } from "../../lib/agent/types";

interface AgentMessageProps { message: AgentMessageData; onAction: (index: number) => void; }

export default function AgentMessage({ message, onAction }: AgentMessageProps) {
  const isAssistant = message.role === "assistant";
  return (
    <div className={`flex gap-2 ${isAssistant ? "justify-start" : "justify-end"}`}>
      {isAssistant && <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300"><Bot className="h-4 w-4" /></div>}
      <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-6 ${isAssistant ? "rounded-tl-sm bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" : "rounded-tr-sm bg-slate-900 text-white"}`}>
        {message.content.split("\n").map((line) => <p key={line}>{line}</p>)}
        {message.actions?.map((action, index) => (
          <button key={`${action.type}-${index}`} type="button" onClick={() => onAction(index)} className="mt-2 block w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-left text-xs font-semibold text-cyan-800 hover:bg-cyan-50 dark:border-cyan-800 dark:bg-slate-900 dark:text-cyan-300 dark:hover:bg-slate-800">
            {action.type === "navigate" ? "Open" : action.type === "prefillForm" ? "Open and prefill" : "Run action"}
          </button>
        ))}
      </div>
      {!isAssistant && <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"><User className="h-4 w-4" /></div>}
    </div>
  );
}