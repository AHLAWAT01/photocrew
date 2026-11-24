import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CloudOff, Download, LoaderCircle, Trash2, X } from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore';
import { formatBytes } from '../utils/format';
import Avatar from './Avatar';

interface Props {
  ids: string[];
  openId: string;
  onNavigate: (photoId: string) => void;
  onClose: () => void;
  requestPreview: (photoId: string) => void;
  onDownloadOne: (photoId: string) => void;
  onRemove: (photoId: string) => void;
}

const SWIPE_THRESHOLD = 60;
const CLOSE_THRESHOLD = 110;

export default function Lightbox({ ids, openId, onNavigate, onClose, requestPreview, onDownloadOne, onRemove }: Props) {
  const photo = useRoomStore((s) => s.photos[openId]);
  const peers = useRoomStore((s) => s.peers);
  const selected = useRoomStore((s) => !!s.selected[openId]);
  const toggleSelected = useRoomStore((s) => s.toggleSelected);
  const transferActive = useRoomStore((s) => !!s.transfer);
  const [drag, setDrag] = useState({ dx: 0, dy: 0, active: false });
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const touch = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);

  const index = ids.indexOf(openId);
  const prevId = index > 0 ? ids[index - 1] : null;
  const nextId = index >= 0 && index < ids.length - 1 ? ids[index + 1] : null;

  // Request the preview for the current photo and prefetch neighbours.
  useEffect(() => {
    requestPreview(openId);
    if (nextId) requestPreview(nextId);
    if (prevId) requestPreview(prevId);
  }, [openId, nextId, prevId, requestPreview]);

  useEffect(() => setPreviewLoaded(false), [openId, photo?.previewUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && prevId) onNavigate(prevId);
      else if (e.key === 'ArrowRight' && nextId) onNavigate(nextId);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [prevId, nextId, onNavigate, onClose]);

  useEffect(() => {
    if (!photo) onClose();
  }, [photo, onClose]);
  if (!photo) return null;

  const owner = photo.isMine ? null : peers[photo.ownerPeerId];
  const ownerName = owner?.name ?? photo.ownerName;
  const online = photo.isMine || !!owner?.connected;
  const showSpinner = online && !photo.previewError && (!photo.previewUrl || !previewLoaded);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = touch.current;
    if (!t) return;
    const dx = e.touches[0].clientX - t.x;
    const dy = e.touches[0].clientY - t.y;
    if (!t.axis && Math.hypot(dx, dy) > 8) t.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (t.axis === 'x') setDrag({ dx: (dx > 0 && !prevId) || (dx < 0 && !nextId) ? dx * 0.3 : dx, dy: 0, active: true });
    else if (t.axis === 'y') setDrag({ dx: 0, dy: Math.max(0, dy), active: true });
  };
  const onTouchEnd = () => {
    const t = touch.current;
    touch.current = null;
    if (t?.axis === 'x') {
      if (drag.dx < -SWIPE_THRESHOLD && nextId) onNavigate(nextId);
      else if (drag.dx > SWIPE_THRESHOLD && prevId) onNavigate(prevId);
    } else if (t?.axis === 'y' && drag.dy > CLOSE_THRESHOLD) {
      onClose();
    }
    setDrag({ dx: 0, dy: 0, active: false });
  };

  const bgOpacity = Math.max(0.35, 1 - drag.dy / 400);
  const date = new Date(photo.timestamp);

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex flex-col" style={{ background: `rgb(0 0 0 / ${bgOpacity})` }} role="dialog" aria-modal="true">
      {/* top bar */}
      <div className="relative z-10 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-3 pt-[calc(env(safe-area-inset-top)+12px)] pb-6">
        <button onClick={onClose} className="rounded-lg bg-white/10 p-2 active:bg-white/20" aria-label="Close">
          <X size={20} />
        </button>
        <Avatar id={photo.ownerPeerId} name={ownerName} size={30} online={online} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{photo.isMine ? 'You' : ownerName}</p>
          <p className="truncate text-[11px] text-zinc-400">
            {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {formatBytes(photo.fileSize)}
            {photo.width > 0 && ` · ${photo.width}×${photo.height}`}
          </p>
        </div>
        <span className="text-xs text-zinc-400 tabular-nums">
          {index + 1} / {ids.length}
        </span>
      </div>

      {/* image stage */}
      <div
        className="no-callout relative -mt-16 flex flex-1 items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          className="relative flex h-full w-full items-center justify-center"
          style={{
            transform: `translate3d(${drag.dx}px, ${drag.dy}px, 0) scale(${1 - drag.dy / 1500})`,
            transition: drag.active ? 'none' : 'transform 250ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          {photo.thumbUrl && (
            <img
              src={photo.thumbUrl}
              alt=""
              draggable={false}
              className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${previewLoaded ? 'opacity-0' : 'opacity-100 blur-[2px]'}`}
            />
          )}
          {photo.previewUrl && (
            <img
              key={photo.previewUrl}
              src={photo.previewUrl}
              alt={photo.fileName}
              draggable={false}
              onLoad={() => setPreviewLoaded(true)}
              className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${previewLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          )}
        </div>

        {showSpinner && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur">
            <LoaderCircle size={14} className="animate-spin" />
            {photo.isMine ? 'Loading…' : `Loading preview from ${ownerName}…`}
          </div>
        )}
        {!online && !photo.previewUrl && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-zinc-300">
            <CloudOff size={14} /> Offline (owner disconnected)
          </div>
        )}
        {photo.previewError && online && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-xs text-zinc-300">
            Preview unavailable
          </div>
        )}

        {prevId && (
          <button onClick={() => onNavigate(prevId)} className="absolute left-2 hidden rounded-full bg-black/50 p-2 sm:block" aria-label="Previous">
            <ChevronLeft size={24} />
          </button>
        )}
        {nextId && (
          <button onClick={() => onNavigate(nextId)} className="absolute right-2 hidden rounded-full bg-black/50 p-2 sm:block" aria-label="Next">
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* bottom actions */}
      <div className="pb-safe relative z-10 flex items-center gap-2 bg-gradient-to-t from-black/90 to-transparent px-4 pt-8">
        {photo.isMine ? (
          <button
            onClick={() => onRemove(photo.photoId)}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold text-danger active:bg-white/20"
          >
            <Trash2 size={16} /> Unshare
          </button>
        ) : (
          <span className="flex-1 truncate text-xs text-zinc-500">{photo.fileName}</span>
        )}
        <div className="flex-1" />
        {online && (
          <>
            <button
              onClick={() => toggleSelected(photo.photoId)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold ${selected ? 'bg-accent text-ink' : 'bg-white/10 active:bg-white/20'}`}
            >
              <Check size={16} strokeWidth={3} /> {selected ? 'Selected' : 'Select'}
            </button>
            <button
              onClick={() => onDownloadOne(photo.photoId)}
              disabled={transferActive}
              className="rounded-lg bg-bone p-2.5 text-ink active:bg-zinc-300 disabled:opacity-40"
              aria-label="Download full resolution"
            >
              <Download size={18} strokeWidth={2.5} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
