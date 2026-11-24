import { useState } from 'react';
import { Check, ChevronLeft, QrCode, Upload } from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore';
import Avatar from './Avatar';
import ConnectionBadge from './ConnectionBadge';
import { shareUrlFor } from './QRModal';

interface Props {
  roomCode: string;
  onLeave: () => void;
  onShowQR: () => void;
  onShowPeople: () => void;
}

export default function RoomHeader({ roomCode, onLeave, onShowQR, onShowPeople }: Props) {
  const peersMap = useRoomStore((s) => s.peers);
  const selfId = useRoomStore((s) => s.selfId);
  const selfName = useRoomStore((s) => s.selfName);
  const serving = useRoomStore((s) => s.serving);
  const [copied, setCopied] = useState(false);
  const peers = Object.values(peersMap).sort((a, b) => Number(b.connected) - Number(a.connected) || a.joinedAt - b.joinedAt);
  const onlineCount = peers.filter((p) => p.connected).length;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrlFor(roomCode));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      onShowQR();
    }
  };

  return (
    <header className="glass pt-safe sticky top-0 z-30 border-b border-white/5">
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <button onClick={onLeave} className="flex items-center gap-0.5 rounded-lg py-2 pr-3 pl-1 text-[15px] text-bone active:opacity-60">
          <ChevronLeft size={22} /> Leave
        </button>
        <button onClick={copyLink} className="flex items-center gap-2 rounded-lg px-3 py-1 active:bg-surface-3" aria-label="Copy invite link">
                    <span className="display text-[28px] tracking-[-0.02em]">{roomCode}</span>
          {copied && <Check size={14} className="text-success" />}
        </button>
        <button onClick={onShowQR} className="flex items-center gap-1.5 rounded-lg bg-bone px-3 py-2 text-[13px] font-semibold text-ink active:bg-white">
          <QrCode size={16} /> QR
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pt-2 pb-2.5">
        <button onClick={onShowPeople} className="flex min-w-0 items-center gap-2" aria-label="People in room">
          <div className="flex -space-x-2">
            <Avatar id={selfId} name={selfName} size={28} />
            {peers.slice(0, 4).map((p) => (
              <Avatar key={p.id} id={p.id} name={p.name} size={28} online={p.connected} />
            ))}
            {peers.length > 4 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold ring-2 ring-black">+{peers.length - 4}</div>
            )}
          </div>
          <span className="truncate text-xs text-zinc-400">{onlineCount === 0 ? 'Just you' : `You + ${onlineCount}`}</span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {serving > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-ink">
              <Upload size={11} className="animate-bounce" /> Sending {serving}
            </span>
          )}
          <ConnectionBadge peers={peers} />
        </div>
      </div>
    </header>
  );
}
