import { useEffect, useState } from 'react';
import { Wifi } from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore';
import { formatBytes, formatSpeed } from '../utils/format';
import Sheet from './Sheet';

export default function TransferSheet({ onCancel }: { onCancel: () => void }) {
  const transfer = useRoomStore((s) => s.transfer);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!transfer) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [transfer]);

  if (!transfer) return null;
  const { doneFiles, failedFiles, totalFiles, receivedBytes, totalBytes, startedAt, allLocal } = transfer;
  const pct = totalBytes > 0 ? Math.min(100, (receivedBytes / totalBytes) * 100) : (doneFiles / Math.max(1, totalFiles)) * 100;
  const elapsed = Math.max(0.5, (now - startedAt) / 1000);
  const speed = receivedBytes / elapsed;
  const current = Math.min(totalFiles, doneFiles + failedFiles + 1);

  return (
    <Sheet open dismissible={false}>
      <div className="pb-2">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
            <Wifi size={24} />
            <span className="absolute inset-0 animate-ping rounded-2xl bg-accent/10" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold leading-snug">
              Pulling {current}/{totalFiles} full-res photos directly {allLocal ? 'over Wi-Fi' : 'peer-to-peer'}...
            </p>
            <p className="text-xs text-zinc-400">No cloud. Straight from your crew's devices.</p>
          </div>
        </div>

        <div className="h-2.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-zinc-400 tabular-nums">
          <span>{formatBytes(receivedBytes)} of {formatBytes(totalBytes)}</span>
          <span>{formatSpeed(speed)}</span>
        </div>
        <p className="mt-1 text-xs text-zinc-500 tabular-nums">
          {doneFiles} received{failedFiles > 0 && <span className="text-danger"> · {failedFiles} failed</span>}
        </p>

        <button onClick={onCancel} className="mt-5 w-full rounded-2xl bg-surface-2 py-3.5 font-semibold text-danger active:bg-surface-3">
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
