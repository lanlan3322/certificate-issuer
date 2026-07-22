"use client";

import {
  DEFAULT_ISSUING_METHODS,
  formatIssuingMethods,
  IssuingMethod,
  SUPPORTED_ISSUING_METHODS,
} from "../lib/constants";

interface IssuingMethodSelectorProps {
  selectedMethods: IssuingMethod[];
  onToggle: (method: IssuingMethod) => void;
  helperText?: string;
}

export default function IssuingMethodSelector({
  selectedMethods,
  onToggle,
  helperText = `${formatIssuingMethods(DEFAULT_ISSUING_METHODS)} are selected by default.`,
}: IssuingMethodSelectorProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="label text-sm md:text-base">Issuing Methods</label>
        <span className="text-xs text-gray-500">
          Default:{" "}
          {DEFAULT_ISSUING_METHODS.map(
            (method) => SUPPORTED_ISSUING_METHODS[method].label
          ).join(", ")}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        {Object.entries(SUPPORTED_ISSUING_METHODS).map(([method, config]) => {
          const issuingMethod = method as IssuingMethod;
          const checked = selectedMethods.includes(issuingMethod);

          return (
            <label
              key={method}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                checked
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(issuingMethod)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="font-medium">{config.label}</span>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500">{helperText}</p>
    </div>
  );
}
