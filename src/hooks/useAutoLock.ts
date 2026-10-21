// src/hooks/useAutoLock.ts — 10-minute user inactivity auto-lock hook.

import { useEffect, useRef, useCallback } from 'react';
import { lockVaultInstance } from '../services/tauri';

// 10 minutes in milliseconds
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

interface UseAutoLockOptions {
  enabled: boolean;
  onAutoLock: () => void;
  timeoutMs?: number;
}

export function useAutoLock({
  enabled,
  onAutoLock,
  timeoutMs = IDLE_TIMEOUT_MS,
}: UseAutoLockOptions) {
  const timerRef = useRef<number | null>(null);
  const onAutoLockRef = useRef(onAutoLock);
  onAutoLockRef.current = onAutoLock;

  const performLock = useCallback(async () => {
    try {
      await lockVaultInstance();
    } catch (err) {
      console.error('Auto-lock error:', err);
    } finally {
      onAutoLockRef.current();
    }
  }, []);

  const resetTimer = useCallback(() => {
    if (!enabled) return;

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      performLock();
    }, timeoutMs);
  }, [enabled, timeoutMs, performLock]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Start timer
    resetTimer();

    // Throttle activity listener so mouse movements don't spam resets
    let lastActivity = Date.now();
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivity > 1000) {
        lastActivity = now;
        resetTimer();
      }
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('mousedown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('wheel', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('wheel', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [enabled, resetTimer]);
}

