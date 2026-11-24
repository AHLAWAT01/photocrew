import { useEffect, useState } from 'react';

export type WakeLockStatus = 'unsupported' | 'active' | 'inactive';

/**
 * Keeps the screen awake while `enabled` is true so phones don't auto-lock
 * (which suspends WebRTC) in the middle of a transfer. The lock is released
 * by the OS whenever the tab is hidden, so we re-acquire it on return.
 */
export function useWakeLock(enabled: boolean): WakeLockStatus {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [status, setStatus] = useState<WakeLockStatus>(supported ? 'inactive' : 'unsupported');

  useEffect(() => {
    if (!supported || !enabled) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await sentinel.release();
          return;
        }
        setStatus('active');
        sentinel.addEventListener('release', () => {
          if (!cancelled) setStatus('inactive');
        });
      } catch {
        setStatus('inactive'); // e.g. low battery mode or not user-activated yet
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    // Some browsers require a user gesture before granting the lock.
    const onInteract = () => void acquire();

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointerdown', onInteract, { passive: true });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pointerdown', onInteract);
      void sentinel?.release().catch(() => {});
      setStatus('inactive');
    };
  }, [enabled, supported]);

  return status;
}
