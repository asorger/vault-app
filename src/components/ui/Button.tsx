// src/components/ui/Button.tsx — Sleek dark button component with comfortable desktop scale.

import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex flex-row items-center justify-center whitespace-nowrap font-medium rounded-lg transition-all duration-150 select-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0c0c0e] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 cursor-pointer';

  const sizeClasses = {
    sm: 'h-9 text-sm px-3.5 gap-2',
    md: 'h-10 text-sm px-4 gap-2',
    lg: 'h-11 text-base px-5 gap-2.5',
  }[size];

  const variantClasses = {
    primary:
      'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm border border-indigo-500/40 focus:ring-indigo-500',
    secondary:
      'bg-neutral-800/90 hover:bg-neutral-700/90 text-neutral-100 border border-neutral-700/70 hover:border-neutral-600 focus:ring-neutral-500 shadow-sm',
    danger:
      'bg-rose-500/15 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 hover:border-rose-500 focus:ring-rose-500 transition-colors shadow-sm',
    ghost:
      'text-neutral-300 hover:text-white hover:bg-neutral-800/60 focus:ring-neutral-600',
    outline:
      'border border-neutral-700 hover:bg-neutral-800 text-neutral-200 focus:ring-neutral-600',
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
