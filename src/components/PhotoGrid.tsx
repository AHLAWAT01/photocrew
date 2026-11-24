import type { PhotoEntry } from '../types';
import PhotoCard from './PhotoCard';

interface Props {
  photos: PhotoEntry[];
  selected: Record<string, true>;
  ownerName: (photo: PhotoEntry) => string;
  isOnline: (photo: PhotoEntry) => boolean;
  onOpen: (photoId: string) => void;
  onToggle: (photoId: string) => void;
}

/** Square 3-column grid on phones, scaling up to 6 columns on wide screens. */
export default function PhotoGrid({ photos, selected, ownerName, isOnline, onOpen, onToggle }: Props) {
  return (
    <div className="grid grid-cols-3 gap-0.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {photos.map((p) => (
        <PhotoCard
          key={p.photoId}
          photo={p}
          ownerName={ownerName(p)}
          online={isOnline(p)}
          selected={!!selected[p.photoId]}
          onOpen={onOpen}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
