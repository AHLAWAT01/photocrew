import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, CircleAlert, Copy, Share2 } from 'lucide-react';
import Sheet from './Sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  roomCode: string;
}

export function shareUrlFor(roomCode: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', roomCode);
  return url.toString();
}

export default function QRModal({ open, onClose, roomCode }: Props) {
  const [copied, setCopied] = useState(false);
  const url = shareUrlFor(roomCode);
  const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  const canShare = typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Invite your crew">
      <div className="flex flex-col items-center pb-2">
        <div className="rounded-xl bg-white p-4">
          <QRCodeSVG value={url} size={216} level="M" marginSize={0} />
        </div>
        <p className="mt-4 text-sm text-zinc-400">Scan with the camera, or enter code</p>
        <p className="mt-1 display text-5xl">{roomCode}</p>

        {isLocalhost && (
          <div className="mt-4 flex gap-2 rounded-2xl bg-warn/15 p-3 text-xs text-amber-200">
            <CircleAlert size={16} className="mt-0.5 shrink-0 text-warn" />
            <p>
              You opened PhotoCrew via <b>localhost</b>, which other phones can't reach. Open the <b>Network</b> URL from the
              terminal (e.g. https://192.168.x.x:5173) so this QR code works.
            </p>
          </div>
        )}

        <div className="mt-5 flex w-full gap-2">
          <button onClick={copy} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-surface-2 py-3.5 font-semibold active:bg-surface-3">
            {copied ? <Check size={18} className="text-success" /> : <Copy size={18} />} {copied ? 'Copied' : 'Copy link'}
          </button>
          {canShare && (
            <button
              onClick={() => navigator.share({ title: 'Join my PhotoCrew room', text: `Join PhotoCrew room ${roomCode}`, url }).catch(() => {})}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-bone py-3.5 font-semibold text-ink active:bg-white"
            >
              <Share2 size={18} /> Share
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
