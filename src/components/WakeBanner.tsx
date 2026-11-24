import { useState } from 'react';
import { Sun, X } from 'lucide-react';
import type { WakeLockStatus } from '../hooks/useWakeLock';

export default function WakeBanner({ status }: { status: WakeLockStatus }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mx-3 mt-3 flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-2.5 text-[13px] ring-1 ring-white/5">
      <Sun size={16} className={status === 'active' ? 'shrink-0 text-warn' : 'shrink-0 text-zinc-500'} />
      <p className="flex-1 leading-snug text-zinc-300">
        Keep this tab open while friends grab your photos.
        <span className="block text-[11px] text-zinc-500">
          {status === 'active' ? 'Screen will stay awake.' : status === 'unsupported' ? "Auto-lock can't be blocked in this browser — disable it for big transfers." : 'Tap anywhere to keep the screen awake.'}
        </span>
      </p>
      <button onClick={() => setHidden(true)} className="p-1 text-zinc-500" aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
}
