// src/hooks/useTransferQueue.ts — Listens to vault transfer progress events.

import { useState, useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { TransferProgressPayload } from '../types/vault';

export function useTransferQueue() {
  const [currentTransfer, setCurrentTransfer] = useState<TransferProgressPayload | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen<TransferProgressPayload>(
          'vault://transfer-progress',
          (event) => {
            const payload = event.payload;
            setCurrentTransfer(payload);
            setIsOpen(true);

            if (closeTimerRef.current !== null) {
              window.clearTimeout(closeTimerRef.current);
              closeTimerRef.current = null;
            }

            if (payload.items_completed >= payload.total_items && payload.total_items > 0) {
              setIsCompleted(true);
              // Auto dismiss after 4 seconds
              closeTimerRef.current = window.setTimeout(() => {
                setIsOpen(false);
                setIsCompleted(false);
              }, 4000);
            } else {
              setIsCompleted(false);
            }
          }
        );
      } catch (err) {
        console.error('Failed to listen to vault transfer progress:', err);
      }
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const closeDrawer = () => {
    setIsOpen(false);
  };

  return {
    currentTransfer,
    isOpen,
    isCompleted,
    closeDrawer,
  };
}

