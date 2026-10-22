// src/components/ui/Button.tsx — Minimalist Blip-inspired button component.

import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  pill?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "secondary",
  size = "md",
  pill = false,
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...props
}) => {
  const roundedClass = pill ? "rounded-full" : "rounded-xl";

  const baseClasses = `inline-flex flex-row items-center justify-center whitespace-nowrap font-medium transition-all duration-150 select-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#121010] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100 cursor-pointer ${roundedClass}`;

  const sizeClasses = {
    sm: "h-8 text-xs px-3 gap-1.5",
    md: "h-9 text-sm px-4 gap-2",
    lg: "h-11 text-base px-5 gap-2.5",
  }[size];

  const variantClasses = {
    primary:
      "bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-950/40 border border-purple-500/40 focus:ring-purple-500",
    secondary:
      "bg-[#201d1c] hover:bg-[#2b2624] text-stone-200 border border-white/[0.08] hover:border-white/[0.15] focus:ring-stone-500 shadow-sm",
    danger:
      "bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 hover:border-rose-500 focus:ring-rose-500 shadow-sm transition-colors",
    ghost:
      "text-stone-300 hover:text-stone-100 hover:bg-white/[0.06] focus:ring-stone-600",
    outline:
      "border border-white/[0.1] hover:border-white/[0.2] bg-transparent text-stone-200 hover:bg-white/[0.04] focus:ring-stone-600",
  }[variant];

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current shrink-0" />
      ) : (
        icon && <span className="inline-flex items-center shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
};
