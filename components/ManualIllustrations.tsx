import type { ReactNode } from "react";

export function ManualFlow({ label, steps }: { label: string; steps: readonly (readonly [string, string])[] }) {
  return (
    <figure className="mt-4">
      <figcaption className="mb-3 font-semibold">{label}</figcaption>
      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map(([title, detail], index) => (
          <li key={title} className="flex gap-3 rounded-xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-900 dark:bg-cyan-950">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-800 font-bold text-white">{index + 1}</span>
            <div>
              <h3 className="font-bold">{title}</h3>
              <p className="mt-1 text-slate-600 dark:text-slate-300">{detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function ManualReference({ caption, headings, rows }: {
  caption: string;
  headings: readonly [string, string];
  rows: readonly (readonly [string, ReactNode])[];
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-left text-sm">
        <caption className="bg-slate-50 p-3 text-left font-semibold text-slate-900 dark:bg-slate-800 dark:text-white">{caption}</caption>
        <thead className="border-y border-slate-200 dark:border-slate-700">
          <tr>{headings.map((heading) => <th key={heading} scope="col" className="px-4 py-3">{heading}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(([title, detail]) => (
            <tr key={title} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
              <th scope="row" className="w-1/3 px-4 py-3 align-top font-semibold">{title}</th>
              <td className="px-4 py-3 align-top">{detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
