import { LoaderCircle } from "lucide-react";

export default function PageLoadingIndicator() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[200] grid place-items-center bg-white/70 backdrop-blur-sm dark:bg-slate-950/70"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-8 py-6 text-slate-700 shadow-xl dark:bg-slate-900 dark:text-slate-200">
        <LoaderCircle className="h-10 w-10 animate-spin text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        <span className="text-sm font-medium">Loading page...</span>
      </div>
    </div>
  );
}
