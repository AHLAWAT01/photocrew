import { Download } from 'lucide-react';
import { formatBytes, plural } from '../utils/format';

interface Props {
  count: number;
  bytes: number;
  unavailable: number;
  onDownload: () => void;
  onClear: () => void;
  onSelectAll?: () => void;
  busy: boolean;
}

export default function SelectionBar({ count, bytes, unavailable, onDownload, onClear, onSelectAll, busy }: Props) {
  return (
    <div className="glass pb-safe animate-sheet-up fixed inset-x-0 bottom-0 z-40 border-t border-white/10 px-4 pt-3">
      <div className="mx-auto max-w-md">
        <div className="mb-2.5 flex items-center justify-between text-[13px]">
          <button onClick={onClear} className="font-medium text-bone underline underline-offset-4 active:opacity-60">Clear</button>
          <span className="text-zinc-400">
            {plural(count, 'photo')} selected
            {unavailable > 0 && <span className="text-warn"> · {unavailable} offline skipped</span>}
          </span>
          {onSelectAll ? (
            <button onClick={onSelectAll} className="font-medium text-bone underline underline-offset-4 active:opacity-60">Select all</button>
          ) : (
            <span className="w-14" />
          )}
        </div>
        <button
          onClick={onDownload}
          disabled={busy || count - unavailable <= 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-bone py-3.5 text-[16px] font-semibold text-ink active:bg-white disabled:opacity-40"
        >
          <Download size={19} strokeWidth={2.5} />
          Download Selected ({plural(count - unavailable, 'photo')} • {formatBytes(bytes)})
        </button>
      </div>
    </div>
  );
}
