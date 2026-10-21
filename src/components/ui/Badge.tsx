// src/components/ui/Badge.tsx — Status badge indicator.

import React from 'react';

interface BadgeProps {
  variant?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'neutral';
  size?: 'sm' | 'md';
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'sm',
  dot = false,
  children,
  className = '',
}) => {
  const variantStyles = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    neutral: 'bg-neutral-800/80 text-neutral-300 border-neutral-700/50',
  }[variant];

  const dotColors = {
    emerald: 'bg-emerald-400',
    indigo: 'bg-indigo-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    neutral: 'bg-neutral-400',
  }[variant];

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  }[size];

  return (
    <span
      className={`inline-flex items-center font-medium border rounded-full select-none ${variantStyles} ${sizeStyles} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors} animate-pulse`} />}
      <span>{children}</span>
    </span>
  );
};

