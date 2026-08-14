interface AgentSuggestionsProps { onSelect: (value: string) => void; page: string; }

export default function AgentSuggestions({ onSelect, page }: AgentSuggestionsProps) {
  const items = page === "/insurance"
    ? ["Start issuing a certificate", "Create professional certificate", "Explain MetaMask signing"]
    : page === "/verify"
      ? ["How do I verify a credential?", "Explain revocation", "Open DID management"]
      : ["Issue certificate", "Verify credential", "Help me configure DID identity"];
  return <div className="flex flex-wrap gap-2 px-4 pb-3">{items.map((item) => <button key={item} type="button" onClick={() => onSelect(item)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-cyan-300 hover:text-cyan-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{item}</button>)}</div>;
}