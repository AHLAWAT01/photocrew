import { useMemo, useState } from 'react';
import { FileArchive, Images, LoaderCircle } from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore';
import { formatBytes, plural } from '../utils/format';
import { SHARE_RECOMMENDED_MAX_FILES, canShareFiles, downloadAsZip, shareFiles } from '../utils/saveFiles';
import Sheet from './Sheet';

interface Props {
  files: File[];
  failed: number;
  roomCode: string;
  onClose: () => void;
}

export default function SaveOptionsSheet({ files, failed, roomCode, onClose }: Props) {
  const pushToast = useRoomStore((s) => s.pushToast);
  const [zipPct, setZipPct] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const shareSupported = useMemo(() => canShareFiles(files), [files]);
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const shareRecommended = shareSupported && files.length <= SHARE_RECOMMENDED_MAX_FILES;

  const saveToCameraRoll = async () => {
    setSharing(true);
    try {
      const res = await shareFiles(files);
      if (res === 'shared') {
        pushToast({ tone: 'success', message: `Shared ${plural(files.length, 'photo')}` });
        onClose();
      }
    } catch (err) {
      console.warn(err);
      pushToast({ tone: 'error', message: 'Share sheet failed — try "Download as ZIP" for big batches.' }, 5000);
    } finally {
      setSharing(false);
    }
  };

  const saveZip = async () => {
    setZipPct(0);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadAsZip(files, `PhotoCrew-${roomCode}-${stamp}.zip`, (p) => setZipPct(p));
      pushToast({ tone: 'success', message: 'ZIP downloaded' });
      onClose();
    } catch (err) {
      console.warn(err);
      pushToast({ tone: 'error', message: 'Could not create the ZIP (device may be low on memory).' }, 5000);
    } finally {
      setZipPct(null);
    }
  };

  const busy = sharing || zipPct !== null;

  return (
    <Sheet open onClose={busy ? undefined : onClose} dismissible={!busy} title={`${plural(files.length, 'photo')} ready`}>
      <p className="-mt-2 mb-4 text-sm text-zinc-400">
        {formatBytes(totalBytes)} pulled peer-to-peer{failed > 0 && <span className="text-danger"> · {failed} couldn't be fetched</span>}. How do you want to save them?
      </p>

      <div className="space-y-2.5 pb-2">
        <button
          onClick={saveToCameraRoll}
          disabled={!shareSupported || busy}
          className="flex w-full items-center gap-4 rounded-2xl bg-surface-2 p-4 text-left active:bg-surface-3 disabled:opacity-40"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bone text-ink">
            {sharing ? <LoaderCircle size={22} className="animate-spin" /> : <Images size={22} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-semibold">
              Save to Camera Roll
              {shareRecommended && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-ink uppercase">Best</span>}
            </p>
            <p className="text-xs text-zinc-400">
              {!shareSupported
                ? 'Not supported in this browser'
                : files.length > SHARE_RECOMMENDED_MAX_FILES
                  ? `Opens the share sheet. Batches over ${SHARE_RECOMMENDED_MAX_FILES} may fail on some phones.`
                  : 'Opens the share sheet → "Save Images" / "Save to Photos"'}
            </p>
          </div>
        </button>

        <button
          onClick={saveZip}
          disabled={busy}
          className="flex w-full items-center gap-4 rounded-2xl bg-surface-2 p-4 text-left active:bg-surface-3 disabled:opacity-40"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-3">
            {zipPct !== null ? <LoaderCircle size={22} className="animate-spin" /> : <FileArchive size={22} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-semibold">
              Download as ZIP
              {!shareRecommended && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-ink uppercase">Best</span>}
            </p>
            <p className="text-xs text-zinc-400">{zipPct !== null ? `Bundling… ${Math.round(zipPct)}%` : 'One file with every original. Great for big batches & desktop.'}</p>
          </div>
        </button>

        <button onClick={onClose} disabled={busy} className="w-full py-3 text-[15px] font-medium text-zinc-400 disabled:opacity-40">
          Done
        </button>
      </div>
    </Sheet>
  );
}
