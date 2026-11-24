import { create } from 'zustand';
import type { PeerInfo, PhotoEntry, TransferState } from '../types';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}

interface RoomState {
  selfId: string;
  selfName: string;
  roomCode: string | null;
  peers: Record<string, PeerInfo>;
  photos: Record<string, PhotoEntry>;
  selected: Record<string, true>;
  indexing: { total: number; done: number } | null;
  transfer: TransferState | null;
  /** Number of full-res files this device is currently streaming to friends. */
  serving: number;
  toasts: Toast[];

  enterRoom: (roomCode: string, selfId: string, selfName: string) => void;
  exitRoom: () => void;
  setSelfName: (name: string) => void;
  upsertPeer: (id: string, patch: Partial<PeerInfo>) => void;
  addPhoto: (entry: PhotoEntry) => void;
  patchPhoto: (id: string, patch: Partial<PhotoEntry>) => void;
  removePhoto: (id: string) => void;
  toggleSelected: (id: string) => void;
  applySelection: (updates: Record<string, boolean>) => void;
  clearSelection: () => void;
  setIndexing: (indexing: { total: number; done: number } | null) => void;
  setTransfer: (transfer: TransferState | null) => void;
  bumpTransfer: (delta: Partial<Pick<TransferState, 'doneFiles' | 'failedFiles' | 'receivedBytes'>>) => void;
  bumpServing: (delta: number) => void;
  pushToast: (toast: Omit<Toast, 'id'>, ttlMs?: number) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

function revokePhotoUrls(p: PhotoEntry | undefined) {
  if (!p) return;
  if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
  if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
}

export const useRoomStore = create<RoomState>((set, get) => ({
  selfId: '',
  selfName: '',
  roomCode: null,
  peers: {},
  photos: {},
  selected: {},
  indexing: null,
  transfer: null,
  serving: 0,
  toasts: [],

  enterRoom: (roomCode, selfId, selfName) => {
    Object.values(get().photos).forEach(revokePhotoUrls);
    set({ roomCode, selfId, selfName, peers: {}, photos: {}, selected: {}, indexing: null, transfer: null, serving: 0 });
  },

  exitRoom: () => {
    Object.values(get().photos).forEach(revokePhotoUrls);
    set({ roomCode: null, peers: {}, photos: {}, selected: {}, indexing: null, transfer: null, serving: 0 });
  },

  setSelfName: (selfName) => set({ selfName }),

  upsertPeer: (id, patch) =>
    set((s) => {
      const prev = s.peers[id] ?? { id, name: 'Connecting…', connected: false, ready: false, link: 'unknown' as const, joinedAt: Date.now() };
      return { peers: { ...s.peers, [id]: { ...prev, ...patch, id } } };
    }),

  addPhoto: (entry) => set((s) => ({ photos: { ...s.photos, [entry.photoId]: entry } })),

  patchPhoto: (id, patch) =>
    set((s) => {
      const prev = s.photos[id];
      if (!prev) return s;
      return { photos: { ...s.photos, [id]: { ...prev, ...patch } } };
    }),

  removePhoto: (id) =>
    set((s) => {
      if (!s.photos[id]) return s;
      revokePhotoUrls(s.photos[id]);
      const photos = { ...s.photos };
      delete photos[id];
      const selected = { ...s.selected };
      delete selected[id];
      return { photos, selected };
    }),

  toggleSelected: (id) =>
    set((s) => {
      const selected = { ...s.selected };
      if (selected[id]) delete selected[id];
      else selected[id] = true;
      return { selected };
    }),

  applySelection: (updates) =>
    set((s) => {
      const selected = { ...s.selected };
      for (const [id, on] of Object.entries(updates)) {
        if (on) selected[id] = true;
        else delete selected[id];
      }
      return { selected };
    }),

  clearSelection: () => set({ selected: {} }),

  setIndexing: (indexing) => set({ indexing }),

  setTransfer: (transfer) => set({ transfer }),

  bumpTransfer: (delta) =>
    set((s) => {
      if (!s.transfer) return s;
      return {
        transfer: {
          ...s.transfer,
          doneFiles: s.transfer.doneFiles + (delta.doneFiles ?? 0),
          failedFiles: s.transfer.failedFiles + (delta.failedFiles ?? 0),
          receivedBytes: s.transfer.receivedBytes + (delta.receivedBytes ?? 0),
        },
      };
    }),

  bumpServing: (delta) => set((s) => ({ serving: Math.max(0, s.serving + delta) })),

  pushToast: (toast, ttlMs = 3500) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...toast, id }] }));
    setTimeout(() => get().dismissToast(id), ttlMs);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
