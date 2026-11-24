import { memo } from 'react';
import { Check, CloudOff, Download } from 'lucide-react';
import type { PhotoEntry } from '../types';
import { colorForId, firstName, initials } from '../utils/names';

interface Props {
  photo: PhotoEntry;
  ownerName: string;
  online: boolean;
  selected: boolean;
  onOpen: (photoId: string) => void;
  onToggle: (photoId: string) => void;
}

function PhotoCard({ photo, ownerName, online, selected, onOpen, onToggle }: Props) {
  // Downloaded photos are already on this device, so the owner going offline doesn't matter for them.
  const offline = !online && !photo.isMine;
  const selectable = !offline;

  return (
    <div
      data-photo-id={photo.photoId}
      data-selectable={selectable ? 'true' : 'false'}
      className="no-callout relative aspect-square overflow-hidden bg-surface"
    >
      <button
        type="button"
        onClick={() => onOpen(photo.photoId)}
        className="absolute inset-0 block h-full w-full"
        aria-label={`Open ${photo.fileName} from ${ownerName}`}
      >
        {photo.thumbUrl ? (
          <img
            src={photo.thumbUrl}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className={`no-callout h-full w-full object-cover transition-[transform,filter] duration-200 ${selected ? 'scale-[0.88] rounded-md' : ''} ${offline ? 'opacity-40 grayscale' : ''}`}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-surface-2" />
        )}
      </button>

      {/* owner badge */}
      <div className="pointer-events-none absolute bottom-1 left-1 flex max-w-[85%] items-center gap-1 rounded-full bg-black/55 py-0.5 pr-2 pl-0.5 backdrop-blur-sm">
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-ink"
          style={{ background: colorForId(photo.ownerPeerId) }}
        >
          {initials(ownerName)}
        </span>
        <span className="truncate text-[10px] font-medium text-white/90">{photo.isMine ? 'You' : firstName(ownerName)}</span>
      </div>

      {offline && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
          <CloudOff size={18} className="text-zinc-300" />
          <span className="text-[9px] leading-tight font-semibold text-zinc-300">Offline<br />(owner disconnected)</span>
        </div>
      )}

      {photo.downloaded && !selected && (
        <div className="pointer-events-none absolute top-1.5 left-1.5 rounded-full bg-success/90 p-0.5" title="Saved">
          <Download size={10} strokeWidth={3} />
        </div>
      )}

      {selectable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(photo.photoId);
          }}
          className="absolute top-0 right-0 flex h-11 w-11 items-start justify-end p-1.5"
          aria-label={selected ? 'Deselect photo' : 'Select photo'}
          aria-pressed={selected}
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] transition-all ${
              selected ? 'animate-pop border-accent bg-accent text-ink' : 'border-white/90 bg-black/25'
            }`}
          >
            {selected && <Check size={14} strokeWidth={3.5} />}
          </span>
        </button>
      )}
    </div>
  );
}

export default memo(PhotoCard);
