import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloudOff, LoaderCircle, QrCode } from 'lucide-react';
import { useP2PRoom } from '../hooks/useP2PRoom';
import { useWakeLock } from '../hooks/useWakeLock';
import { useDragSelect } from '../hooks/useDragSelect';
import { useRoomStore } from '../store/useRoomStore';
import type { DownloadResult, PhotoEntry } from '../types';
import { plural } from '../utils/format';
import { canShareFiles, downloadFile, shareFiles } from '../utils/saveFiles';
import AddPhotosButton from './AddPhotosButton';
import Avatar from './Avatar';
import FilterTabs, { type FilterMode } from './FilterTabs';
import Lightbox from './Lightbox';
import PeopleSheet from './PeopleSheet';
import PhotoGrid from './PhotoGrid';
import QRModal from './QRModal';
import RoomHeader from './RoomHeader';
import SaveOptionsSheet from './SaveOptionsSheet';
import SelectionBar from './SelectionBar';
import TransferSheet from './TransferSheet';
import WakeBanner from './WakeBanner';

interface Props {
  roomCode: string;
  initialName: string;
  onLeave: () => void;
  onRename: (name: string) => void;
}

interface Section {
  key: string;
  ownerId?: string;
  title?: string;
  online?: boolean;
  photos: PhotoEntry[];
}

export default function RoomView({ roomCode, initialName, onLeave, onRename }: Props) {
  const api = useP2PRoom(roomCode, initialName);
  const photosMap = useRoomStore((s) => s.photos);
  const peers = useRoomStore((s) => s.peers);
  const selected = useRoomStore((s) => s.selected);
  const selfId = useRoomStore((s) => s.selfId);
  const selfName = useRoomStore((s) => s.selfName);
  const indexing = useRoomStore((s) => s.indexing);
  const transfer = useRoomStore((s) => s.transfer);
  const toggleSelected = useRoomStore((s) => s.toggleSelected);
  const applySelection = useRoomStore((s) => s.applySelection);
  const clearSelection = useRoomStore((s) => s.clearSelection);
  const setTransfer = useRoomStore((s) => s.setTransfer);
  const pushToast = useRoomStore((s) => s.pushToast);

  const wakeStatus = useWakeLock(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [saveResult, setSaveResult] = useState<DownloadResult | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const isOnline = useCallback((p: PhotoEntry) => p.isMine || !!peers[p.ownerPeerId]?.connected, [peers]);
  const ownerName = useCallback((p: PhotoEntry) => (p.isMine ? selfName : (peers[p.ownerPeerId]?.name ?? p.ownerName)), [peers, selfName]);

  const allPhotos = useMemo(
    () => Object.values(photosMap).sort((a, b) => b.timestamp - a.timestamp || a.photoId.localeCompare(b.photoId)),
    [photosMap],
  );
  const myCount = useMemo(() => allPhotos.filter((p) => p.isMine).length, [allPhotos]);
  const onlinePeerCount = Object.values(peers).filter((p) => p.connected).length;

  const sections = useMemo<Section[]>(() => {
    if (filter === 'all') return [{ key: 'all', photos: allPhotos }];
    if (filter === 'selected') return [{ key: 'selected', photos: allPhotos.filter((p) => selected[p.photoId]) }];
    const groups = new Map<string, PhotoEntry[]>();
    for (const p of allPhotos) {
      const list = groups.get(p.ownerPeerId) ?? [];
      list.push(p);
      groups.set(p.ownerPeerId, list);
    }
    const order = [selfId, ...Object.values(peers).sort((a, b) => a.joinedAt - b.joinedAt).map((p) => p.id)];
    for (const id of groups.keys()) if (!order.includes(id)) order.push(id);
    return order
      .filter((id) => groups.has(id))
      .map((id) => {
        const photos = groups.get(id)!;
        const isSelf = id === selfId;
        return {
          key: id,
          ownerId: id,
          title: isSelf ? `${selfName} (you)` : (peers[id]?.name ?? photos[0].ownerName),
          online: isSelf || !!peers[id]?.connected,
          photos,
        };
      });
  }, [filter, allPhotos, selected, peers, selfId, selfName]);

  const visibleIds = useMemo(() => sections.flatMap((s) => s.photos.map((p) => p.photoId)), [sections]);

  const selectedPhotos = useMemo(() => allPhotos.filter((p) => selected[p.photoId]), [allPhotos, selected]);
  const downloadable = selectedPhotos.filter(isOnline);
  const selectedBytes = downloadable.reduce((sum, p) => sum + p.fileSize, 0);

  const { shouldSuppressClick } = useDragSelect(gridRef, {
    isSelected: (id) => !!useRoomStore.getState().selected[id],
    applySelection,
  });

  const handleOpen = useCallback((id: string) => !shouldSuppressClick() && setOpenId(id), [shouldSuppressClick]);
  const handleToggle = useCallback((id: string) => !shouldSuppressClick() && toggleSelected(id), [shouldSuppressClick, toggleSelected]);
  const closeLightbox = useCallback(() => setOpenId(null), []);

  // Warn before closing the tab while friends might still be pulling our photos.
  useEffect(() => {
    if (myCount === 0 || onlinePeerCount === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [myCount, onlinePeerCount]);

  const leave = () => {
    if (myCount > 0 && onlinePeerCount > 0 && !window.confirm('Leave the room? Friends will no longer be able to download your photos.')) return;
    onLeave();
  };

  const runDownload = async (ids: string[]) => {
    let result: DownloadResult;
    try {
      result = await api.downloadPhotos(ids);
    } catch (err) {
      pushToast({ tone: 'error', message: (err as Error).message });
      return;
    } finally {
      setTransfer(null);
    }
    if (result.files.length === 0) {
      pushToast(
        result.cancelled
          ? { tone: 'info', message: 'Download cancelled' }
          : { tone: 'error', message: "Couldn't pull those photos — the owner may have gone offline." },
      );
      return;
    }
    if (!result.cancelled) applySelection(Object.fromEntries(ids.map((id) => [id, false])));
    if (result.files.length === 1 && ids.length === 1) {
      const [file] = result.files;
      downloadFile(file, file.name);
      pushToast(
        {
          tone: 'success',
          message: `Saved ${file.name}`,
          action: canShareFiles([file])
            ? { label: 'Save to Photos', onClick: () => void shareFiles([file]).catch(() => {}) }
            : undefined,
        },
        6000,
      );
    } else {
      setSaveResult(result);
    }
  };

  const handleRemove = (id: string) => {
    const idx = visibleIds.indexOf(id);
    const next = visibleIds[idx + 1] ?? visibleIds[idx - 1] ?? null;
    api.removePhoto(id);
    setOpenId(next);
  };

  const selectAllVisible = () => {
    const updates: Record<string, boolean> = {};
    sections.forEach((s) => s.photos.forEach((p) => isOnline(p) && (updates[p.photoId] = true)));
    applySelection(updates);
  };

  const selectionCount = selectedPhotos.length;
  const everyVisibleSelected = visibleIds.length > 0 && sections.every((s) => s.photos.every((p) => !isOnline(p) || selected[p.photoId]));

  return (
    <div className="min-h-dvh pb-44">
      <RoomHeader roomCode={roomCode} onLeave={leave} onShowQR={() => setShowQR(true)} onShowPeople={() => setShowPeople(true)} />
      <WakeBanner status={wakeStatus} />
      <FilterTabs value={filter} onChange={setFilter} allCount={allPhotos.length} selectedCount={selectionCount} />

      {indexing && (
        <div className="mx-3 mt-3 rounded-2xl bg-surface px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-[13px]">
            <LoaderCircle size={14} className="animate-spin text-accent" />
            <span className="flex-1">Indexing {indexing.done}/{indexing.total} photos locally…</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(indexing.done / Math.max(1, indexing.total)) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">Only small previews are shared. Originals stay on this device.</p>
        </div>
      )}

      <div ref={gridRef} className="mt-3">
        {allPhotos.length === 0 ? (
          <EmptyState onFiles={api.addFiles} onInvite={() => setShowQR(true)} hasPeers={onlinePeerCount > 0} />
        ) : filter === 'selected' && selectionCount === 0 ? (
          <p className="px-8 py-20 text-center text-sm text-zinc-500">
            Tap the circle on any photo — or long-press and drag — to pick photos to download.
          </p>
        ) : (
          sections.map((section) => (
            <section key={section.key} className="mb-4">
              {section.ownerId && (
                <SectionHeader
                  section={section}
                  selected={selected}
                  onSelectAll={(on) => applySelection(Object.fromEntries(section.photos.map((p) => [p.photoId, on])))}
                />
              )}
              <PhotoGrid
                photos={section.photos}
                selected={selected}
                ownerName={ownerName}
                isOnline={isOnline}
                onOpen={handleOpen}
                onToggle={handleToggle}
              />
            </section>
          ))
        )}
      </div>

      {allPhotos.length > 0 && <AddPhotosButton onFiles={api.addFiles} raised={selectionCount > 0} />}

      {selectionCount > 0 && (
        <SelectionBar
          count={selectionCount}
          bytes={selectedBytes}
          unavailable={selectionCount - downloadable.length}
          busy={!!transfer}
          onClear={clearSelection}
          onSelectAll={everyVisibleSelected ? undefined : selectAllVisible}
          onDownload={() => void runDownload(downloadable.map((p) => p.photoId))}
        />
      )}

      {openId && (
        <Lightbox
          ids={visibleIds}
          openId={openId}
          onNavigate={setOpenId}
          onClose={closeLightbox}
          requestPreview={api.requestPreview}
          onDownloadOne={(id) => void runDownload([id])}
          onRemove={handleRemove}
        />
      )}

      {transfer && <TransferSheet onCancel={api.cancelDownload} />}
      {saveResult && <SaveOptionsSheet files={saveResult.files} failed={saveResult.failed} roomCode={roomCode} onClose={() => setSaveResult(null)} />}
      <QRModal open={showQR} onClose={() => setShowQR(false)} roomCode={roomCode} />
      <PeopleSheet
        open={showPeople}
        onClose={() => setShowPeople(false)}
        onRename={(name) => {
          api.setName(name);
          onRename(name);
        }}
      />
    </div>
  );
}

function SectionHeader({ section, selected, onSelectAll }: { section: Section; selected: Record<string, true>; onSelectAll: (on: boolean) => void }) {
  const allSelected = section.photos.every((p) => selected[p.photoId]);
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5">
      <Avatar id={section.ownerId!} name={section.title?.replace(/ \(you\)$/, '') ?? ''} size={26} online={section.online} showStatus />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{section.title}</p>
        <p className="flex items-center gap-1 text-[11px] text-zinc-500">
          {plural(section.photos.length, 'photo')}
          {!section.online && (
            <>
              {' · '}
              <CloudOff size={11} /> offline
            </>
          )}
        </p>
      </div>
      {section.online && (
        <button onClick={() => onSelectAll(!allSelected)} className="text-[13px] font-medium text-bone underline underline-offset-4 active:opacity-60">
          {allSelected ? 'Deselect' : 'Select all'}
        </button>
      )}
    </div>
  );
}

function EmptyState({ onFiles, onInvite, hasPeers }: { onFiles: (files: File[]) => void; onInvite: () => void; hasPeers: boolean }) {
  return (
    <div className="flex flex-col items-center px-8 pt-16 pb-10 text-center">
      <h2 className="display text-4xl">Nothing here yet</h2>
      <p className="mt-3 mb-7 max-w-xs font-serif text-lg leading-snug italic text-zinc-300">
        Add your photos and the crew sees small previews. Originals leave your device only when someone picks them.
      </p>
      <AddPhotosButton onFiles={onFiles} variant="inline" />
      {!hasPeers && (
        <button onClick={onInvite} className="mt-4 flex items-center gap-2 text-sm font-medium text-bone underline underline-offset-4 active:opacity-60">
          <QrCode size={16} /> Invite your crew with a QR code
        </button>
      )}
    </div>
  );
}
