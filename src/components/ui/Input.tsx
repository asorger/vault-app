// src/components/ui/Input.tsx — Sleek minimalist input field with warm surfaces and purple focus ring.

import React, { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  pill?: boolean;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      pill = false,
      icon,
      rightElement,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId =
      id ||
      (label
        ? `vlt-${label.toLowerCase().replace(/[^a-z0-9]/g, "")}-${generatedId.replace(/:/g, "")}`
        : `vlt-field-${generatedId.replace(/:/g, "")}`);

    const roundedClass = pill ? "rounded-full" : "rounded-xl";

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium tracking-wide text-stone-300 flex items-center justify-between"
          >
            <span>{label}</span>
            {hint && (
              <span className="text-[11px] text-stone-400 font-normal">
                {hint}
              </span>
            )}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3.5 text-stone-400 pointer-events-none flex items-center">
              {icon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-autocomplete="none"
            data-form-type="other"
            data-1p-ignore="true"
            data-lpignore="true"
            className={`w-full bg-[#181514] text-stone-100 placeholder-stone-400 text-sm border transition-all duration-150 py-2.5 ${roundedClass} ${
              icon ? "pl-10" : "pl-3.5"
            } ${rightElement ? "pr-10" : "pr-3.5"} ${
              error
                ? "border-rose-500/80 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50"
                : "border-white/[0.08] hover:border-white/[0.14] focus:border-purple-500/80 focus:ring-1 focus:ring-purple-500/40"
            } focus:outline-none ${className}`}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 flex items-center">
              {rightElement}
            </div>
          )}
        </div>
        {error && (
          <p className="text-xs text-rose-400 flex items-center gap-1 mt-0.5">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
