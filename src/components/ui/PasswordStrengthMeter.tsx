// src/components/ui/PasswordStrengthMeter.tsx — Clean, minimal password strength indicator.

import React, { useMemo } from 'react';
import { Check, X } from 'lucide-react';

interface PasswordStrengthMeterProps {
  password: string;
  confirmPassword?: string;
  showMismatch?: boolean;
}

export function evaluatePasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!password) {
    return { score: 0, label: '', color: 'bg-neutral-800' };
  }

  let score = 0;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const length = password.length;

  if (length >= 8) score++;
  if (length >= 10 && ((hasLower && hasUpper) || hasNumber || hasSpecial)) score++;
  if (length >= 12 && hasLower && hasUpper && hasNumber) score++;
  if (length >= 14 && hasLower && hasUpper && hasNumber && hasSpecial) score++;

  switch (score) {
    case 1:
      return { score: 1, label: 'Weak', color: 'bg-rose-500' };
    case 2:
      return { score: 2, label: 'Fair', color: 'bg-amber-500' };
    case 3:
      return { score: 3, label: 'Good', color: 'bg-indigo-500' };
    case 4:
      return { score: 4, label: 'Strong', color: 'bg-emerald-500' };
    default:
      return { score: 0, label: 'Too short (min 8)', color: 'bg-rose-600' };
  }
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  password,
  confirmPassword,
  showMismatch = true,
}) => {
  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const isMatch =
    confirmPassword !== undefined && password === confirmPassword && password.length > 0;
  const hasMismatch =
    confirmPassword !== undefined && confirmPassword.length > 0 && password !== confirmPassword;

  if (!password && !confirmPassword) return null;

  return (
    <div className="w-full flex flex-col gap-1.5 mt-0.5">
      <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={`h-full rounded-full transition-all duration-200 ${
              strength.score >= step ? strength.color : 'bg-neutral-800'
            }`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span>{strength.label}</span>
        {showMismatch && (
          <>
            {hasMismatch && (
              <span className="flex items-center gap-1 text-rose-400">
                <X className="w-3.5 h-3.5" />
                Passwords don't match
              </span>
            )}
            {isMatch && (
              <span className="flex items-center gap-1 text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                Matched
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
};
