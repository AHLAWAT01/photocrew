/**
 * RoomEngine owns all networking for one PhotoCrew room.
 *
 * - Trystero (Nostr relays) handles serverless matchmaking + WebRTC signaling.
 * - On every peer connection we open our own *negotiated* RTCDataChannel so we
 *   control chunk size (64KB) and backpressure (bufferedAmountLowThreshold)
 *   directly, independent of Trystero's internal message framing.
 * - Original File objects stay in `localFiles` and are only read when a peer
 *   explicitly requests the full-resolution version.
 */
import { joinRoom, selfId, type Room } from 'trystero';
import { useRoomStore } from '../store/useRoomStore';
import type { DownloadResult, LinkType, PhotoEntry, PhotoMeta, TransferKind, WireMessage } from '../types';
import {
  BackpressureSender,
  ChannelClosedError,
  PrioritySendQueue,
  StreamAssembler,
  TransferCancelledError,
  resolveChunkSize,
  type IncomingStreamInfo,
} from '../utils/chunkTransfer';
import { createPreview, createThumbnail, guessMimeType, isProbablyImage } from '../utils/imageProcessor';
import { genId, sanitizeName } from '../utils/names';

const APP_ID = 'photocrew-p2p-v1';
const DATA_CHANNEL_LABEL = 'photocrew';
/** Negotiated channel id; Trystero's own channel uses auto-assigned ids starting at 0/1. */
const DATA_CHANNEL_ID = 42;
const HELLO_RETRY_MS = 700;
const STATS_INTERVAL_MS = 5000;
const STALL_TIMEOUT_MS = 60_000;
const MAX_REQUEST_IDS = 1000;
const RELAY_REDUNDANCY = 8;

const PRIORITY_PREVIEW = 0;
const PRIORITY_THUMB = 1;
const PRIORITY_FULL = 2;

interface PeerLink {
  peerId: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel;
  sender: BackpressureSender;
  queue: PrioritySendQueue;
  assembler: StreamAssembler;
  ready: boolean;
  chunkSize: number;
  /** photoIds the remote peer asked us to stop sending. */
  cancelled: Set<string>;
  helloTimer: ReturnType<typeof setInterval> | null;
  statsTimer: ReturnType<typeof setInterval> | null;
}

interface PendingFull {
  peerId: string;
  photoId: string;
  resolve: (file: File) => void;
  reject: (err: Error) => void;
}

export class DownloadCancelledError extends Error {
  constructor() {
    super('Download cancelled');
    this.name = 'DownloadCancelledError';
  }
}

const noop = () => {};
const pendingKey = (peerId: string, photoId: string) => `${peerId}|${photoId}`;

const isPrivateAddress = (addr?: string) =>
  !!addr &&
  (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.)/.test(addr) ||
    /^(fe80:|fc|fd)/i.test(addr) ||
    addr.endsWith('.local'));

interface CandidateStats {
  candidateType?: string;
  address?: string;
  ip?: string;
}

async function detectLinkType(pc: RTCPeerConnection): Promise<LinkType> {
  if (pc.connectionState === 'closed') return 'unknown';
  const stats = await pc.getStats();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pair: any = null;
  stats.forEach((r) => {
    if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId) ?? pair;
  });
  if (!pair) {
    stats.forEach((r) => {
      if (r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded'))) pair = r;
    });
  }
  if (!pair) return 'unknown';
  const local = stats.get(pair.localCandidateId) as CandidateStats | undefined;
  const remote = stats.get(pair.remoteCandidateId) as CandidateStats | undefined;
  if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') return 'relay';
  if (local?.candidateType === 'host' && remote?.candidateType === 'host') return 'local';
  // On a LAN the peer's mDNS host candidate often arrives *after* the first STUN check succeeds, so it is
  // recorded as peer-reflexive. Browsers blank the address for privacy; a blank or private address with a
  // direct host candidate on our side still means both devices are on the same network.
  const remoteAddr = remote?.address || remote?.ip || '';
  if (local?.candidateType === 'host' && remote?.candidateType === 'prflx' && (!remoteAddr || isPrivateAddress(remoteAddr))) return 'local';
  return 'internet';
}

export class RoomEngine {
  readonly selfId = selfId;
  private room: Room | null = null;
  private links = new Map<string, PeerLink>();
  private localFiles = new Map<string, File>();
  private localThumbs = new Map<string, Blob>();
  private localMeta = new Map<string, PhotoMeta>();
  private previewCache = new Map<string, Promise<Blob>>();
  private pendingFull = new Map<string, PendingFull>();
  private pendingPreview = new Set<string>();
  private fingerprints = new Set<string>();
  private name: string;
  private destroyed = false;
  private lastProgressAt = 0;
  private downloadCancelled = false;

  constructor(private readonly roomCode: string, name: string) {
    this.name = sanitizeName(name);
  }

  private get store() {
    return useRoomStore.getState();
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  join(): void {
    this.store.enterRoom(this.roomCode, selfId, this.name);
    try {
      // Use more public Nostr relays than the default 5: some reject ephemeral events,
      // so extra redundancy makes matchmaking far more reliable.
      const room = joinRoom({ appId: APP_ID, relayConfig: { redundancy: RELAY_REDUNDANCY } }, `room-${this.roomCode}`, {
        onJoinError: (e) => this.store.pushToast({ tone: 'error', message: `Connection error: ${e.error}` }),
      });
      room.onPeerJoin = (id) => this.handlePeerJoin(id);
      room.onPeerLeave = (id) => this.handlePeerLeave(id);
      this.room = room;
    } catch (err) {
      console.error('[PhotoCrew] joinRoom failed', err);
      this.store.pushToast(
        {
          tone: 'error',
          message: window.isSecureContext
            ? 'Could not start peer-to-peer networking in this browser.'
            : 'PhotoCrew needs HTTPS. Open the https:// URL printed by the dev server.',
        },
        8000,
      );
    }
  }

  leave(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.rejectAllPending(new ChannelClosedError());
    for (const peerId of [...this.links.keys()]) this.teardownLink(peerId);
    void this.room?.leave().catch(noop);
    this.room = null;
    this.localFiles.clear();
    this.localThumbs.clear();
    this.localMeta.clear();
    this.previewCache.clear();
    this.indexQueue = [];
    this.store.exitRoom();
  }

  setName(name: string): void {
    this.name = sanitizeName(name);
    this.store.setSelfName(this.name);
    for (const [id, meta] of this.localMeta) {
      const next = { ...meta, ownerName: this.name };
      this.localMeta.set(id, next);
      this.store.patchPhoto(id, { ownerName: this.name });
    }
    for (const link of this.links.values()) {
      if (link.ready) link.sender.sendJSON({ t: 'hello', name: this.name, ack: true } satisfies WireMessage).catch(noop);
    }
  }

  // ───────────────────────────── peers ─────────────────────────────

  private handlePeerJoin(peerId: string): void {
    if (this.destroyed || !this.room) return;
    this.teardownLink(peerId);
    const existing = this.store.peers[peerId];
    this.store.upsertPeer(peerId, {
      name: existing?.name ?? 'Connecting…',
      connected: true,
      ready: false,
      link: 'unknown',
      joinedAt: existing?.joinedAt ?? Date.now(),
    });

    const pc = this.room.getPeers()[peerId];
    if (!pc) return;

    let channel: RTCDataChannel;
    try {
      channel = pc.createDataChannel(DATA_CHANNEL_LABEL, { negotiated: true, id: DATA_CHANNEL_ID, ordered: true });
    } catch (err) {
      console.error('[PhotoCrew] could not open data channel', err);
      this.store.pushToast({ tone: 'error', message: 'Could not open a transfer channel to a friend.' });
      return;
    }
    channel.binaryType = 'arraybuffer';

    const link: PeerLink = {
      peerId,
      pc,
      channel,
      sender: new BackpressureSender(channel),
      queue: new PrioritySendQueue(),
      assembler: new StreamAssembler(),
      ready: false,
      chunkSize: resolveChunkSize(pc),
      cancelled: new Set(),
      helloTimer: null,
      statsTimer: null,
    };
    this.links.set(peerId, link);

    channel.onopen = () => this.handleChannelOpen(link);
    channel.onmessage = (e: MessageEvent) => this.handleChannelMessage(link, e.data);
    channel.onclose = () => {
      if (this.links.get(peerId) === link) this.store.upsertPeer(peerId, { ready: false });
    };
    if (channel.readyState === 'open') this.handleChannelOpen(link);

    link.statsTimer = setInterval(() => void this.refreshLinkType(link), STATS_INTERVAL_MS);
    setTimeout(() => void this.refreshLinkType(link), 1200);
  }

  private handlePeerLeave(peerId: string): void {
    const peer = this.store.peers[peerId];
    this.teardownLink(peerId);
    this.rejectPendingFor(peerId, new ChannelClosedError());
    for (const id of this.pendingPreview) {
      if (this.store.photos[id]?.ownerPeerId === peerId) this.pendingPreview.delete(id);
    }
    if (!peer) return;
    this.store.upsertPeer(peerId, { connected: false, ready: false, link: 'unknown' });
    // Photos stay in the grid, marked offline; nothing gets removed.
    const offlineSelected = Object.keys(this.store.selected).filter(
      (id) => this.store.photos[id]?.ownerPeerId === peerId && !this.store.photos[id]?.downloaded,
    );
    const updates: Record<string, boolean> = {};
    offlineSelected.forEach((id) => (updates[id] = false));
    if (offlineSelected.length) this.store.applySelection(updates);
    this.store.pushToast({ tone: 'info', message: `${peer.name} left — their photos are offline` });
  }

  private teardownLink(peerId: string): void {
    const link = this.links.get(peerId);
    if (!link) return;
    this.links.delete(peerId);
    if (link.helloTimer) clearInterval(link.helloTimer);
    if (link.statsTimer) clearInterval(link.statsTimer);
    link.queue.close();
    link.assembler.clear();
    link.channel.onopen = null;
    link.channel.onmessage = null;
    link.channel.onclose = null;
    try {
      link.channel.close();
    } catch {
      /* already closed */
    }
  }

  private async refreshLinkType(link: PeerLink): Promise<void> {
    if (this.links.get(link.peerId) !== link) return;
    try {
      const type = await detectLinkType(link.pc);
      if (type !== 'unknown' && this.store.peers[link.peerId]?.link !== type) {
        this.store.upsertPeer(link.peerId, { link: type });
      }
      link.chunkSize = resolveChunkSize(link.pc);
    } catch {
      /* stats unavailable – keep previous value */
    }
  }

  // ───────────────────────────── messaging ─────────────────────────────

  /**
   * Both sides create the negotiated channel independently, so a message sent
   * before the other side has created it can be dropped. We repeat `hello`
   * until the peer answers, which guarantees both ends are listening.
   */
  private handleChannelOpen(link: PeerLink): void {
    const sendHello = () => link.sender.sendJSON({ t: 'hello', name: this.name, ack: false } satisfies WireMessage).catch(noop);
    sendHello();
    if (link.helloTimer) clearInterval(link.helloTimer);
    link.helloTimer = setInterval(() => {
      if (link.ready || !link.sender.isOpen || this.links.get(link.peerId) !== link) {
        if (link.helloTimer) clearInterval(link.helloTimer);
        link.helloTimer = null;
        return;
      }
      sendHello();
    }, HELLO_RETRY_MS);
  }

  private handleChannelMessage(link: PeerLink, data: unknown): void {
    if (this.destroyed || this.links.get(link.peerId) !== link) return;
    if (typeof data === 'string') {
      let msg: WireMessage;
      try {
        msg = JSON.parse(data) as WireMessage;
      } catch {
        return;
      }
      this.handleControl(link, msg);
    } else if (data instanceof ArrayBuffer) {
      this.handleBinary(link, data);
    }
  }

  private handleControl(link: PeerLink, msg: WireMessage): void {
    const { peerId } = link;
    switch (msg.t) {
      case 'hello': {
        const name = sanitizeName(msg.name);
        const wasReady = link.ready;
        this.store.upsertPeer(peerId, { name, connected: true });
        if (!msg.ack) link.sender.sendJSON({ t: 'hello', name: this.name, ack: true } satisfies WireMessage).catch(noop);
        if (!wasReady) {
          link.ready = true;
          if (link.helloTimer) clearInterval(link.helloTimer);
          link.helloTimer = null;
          this.store.upsertPeer(peerId, { ready: true });
          this.store.pushToast({ tone: 'success', message: `${name} joined the crew` });
          this.syncAllPhotosTo(link);
        }
        break;
      }
      case 'photo-meta': {
        const m = msg.meta;
        if (!m || typeof m.photoId !== 'string') return;
        const meta: PhotoMeta = {
          photoId: m.photoId.slice(0, 64),
          ownerPeerId: peerId,
          ownerName: sanitizeName(m.ownerName),
          fileName: String(m.fileName ?? 'photo.jpg').slice(0, 200),
          fileSize: Math.max(0, Number(m.fileSize) || 0),
          mimeType: String(m.mimeType ?? 'image/jpeg').slice(0, 60),
          width: Math.max(0, Number(m.width) || 0),
          height: Math.max(0, Number(m.height) || 0),
          timestamp: Number(m.timestamp) || Date.now(),
        };
        const existing = this.store.photos[meta.photoId];
        if (existing && existing.ownerPeerId !== peerId) return;
        if (existing) this.store.patchPhoto(meta.photoId, meta);
        else this.store.addPhoto({ ...meta, isMine: false, downloaded: false, addedAt: Date.now() });
        break;
      }
      case 'photo-remove': {
        const p = this.store.photos[msg.photoId];
        if (!p || p.ownerPeerId !== peerId) return;
        this.pendingFull.get(pendingKey(peerId, msg.photoId))?.reject(new Error('Photo was removed by its owner'));
        this.pendingFull.delete(pendingKey(peerId, msg.photoId));
        this.store.removePhoto(msg.photoId);
        break;
      }
      case 'request':
        this.handleRequest(link, msg.kind, Array.isArray(msg.photoIds) ? msg.photoIds.slice(0, MAX_REQUEST_IDS) : []);
        break;
      case 'cancel':
        if (Array.isArray(msg.photoIds)) msg.photoIds.slice(0, MAX_REQUEST_IDS).forEach((id) => link.cancelled.add(id));
        break;
      case 'stream-start': {
        const p = this.store.photos[msg.photoId];
        if (!p || p.ownerPeerId !== peerId) return;
        // Only accept full files we actually asked for.
        if (msg.kind === 'full' && !this.pendingFull.has(pendingKey(peerId, msg.photoId))) return;
        const info: IncomingStreamInfo = {
          s: String(msg.s),
          kind: msg.kind,
          photoId: msg.photoId,
          size: Math.max(0, Number(msg.size) || 0),
          mime: String(msg.mime || p.mimeType || 'image/jpeg'),
        };
        const done = link.assembler.start(info);
        if (done?.blob) this.handleStreamComplete(link, done.info, done.blob);
        break;
      }
      case 'stream-abort':
        link.assembler.abort(String(msg.s));
        break;
      case 'request-error': {
        if (msg.kind === 'full') {
          const key = pendingKey(peerId, msg.photoId);
          this.pendingFull.get(key)?.reject(new Error(msg.reason || 'Owner could not send the file'));
          this.pendingFull.delete(key);
        } else {
          this.pendingPreview.delete(msg.photoId);
          this.store.patchPhoto(msg.photoId, { previewError: true });
        }
        break;
      }
    }
  }

  private handleBinary(link: PeerLink, buffer: ArrayBuffer): void {
    const progress = link.assembler.push(buffer);
    if (!progress) return;
    if (progress.info.kind === 'full') {
      this.lastProgressAt = Date.now();
      this.store.bumpTransfer({ receivedBytes: progress.delta });
    }
    if (progress.blob) this.handleStreamComplete(link, progress.info, progress.blob);
  }

  private handleStreamComplete(link: PeerLink, info: IncomingStreamInfo, blob: Blob): void {
    const photo = this.store.photos[info.photoId];
    switch (info.kind) {
      case 'thumb': {
        if (!photo || photo.ownerPeerId !== link.peerId) return;
        if (photo.thumbUrl) URL.revokeObjectURL(photo.thumbUrl);
        this.store.patchPhoto(info.photoId, { thumbUrl: URL.createObjectURL(blob) });
        break;
      }
      case 'preview': {
        this.pendingPreview.delete(info.photoId);
        if (!photo || photo.ownerPeerId !== link.peerId) return;
        if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
        this.store.patchPhoto(info.photoId, { previewUrl: URL.createObjectURL(blob), previewError: false });
        break;
      }
      case 'full': {
        const key = pendingKey(link.peerId, info.photoId);
        const pending = this.pendingFull.get(key);
        if (!pending) return;
        this.pendingFull.delete(key);
        const file = new File([blob], photo?.fileName ?? `photocrew-${info.photoId.slice(0, 8)}.jpg`, {
          type: info.mime || photo?.mimeType || 'image/jpeg',
          lastModified: photo?.timestamp ?? Date.now(),
        });
        pending.resolve(file);
        break;
      }
    }
  }

  // ───────────────────────────── serving (owner side) ─────────────────────────────

  private handleRequest(link: PeerLink, kind: 'preview' | 'full', photoIds: string[]): void {
    for (const photoId of photoIds) {
      const file = this.localFiles.get(photoId);
      if (!file) {
        link.sender.sendJSON({ t: 'request-error', kind, photoId, reason: 'Photo is no longer shared' } satisfies WireMessage).catch(noop);
        continue;
      }
      link.cancelled.delete(photoId);
      const priority = kind === 'preview' ? PRIORITY_PREVIEW : PRIORITY_FULL;
      link.queue
        .enqueue(priority, async () => {
          if (link.cancelled.delete(photoId)) return;
          const blob = kind === 'preview' ? await this.getPreviewBlob(photoId, file) : file;
          const mime = blob.type || this.localMeta.get(photoId)?.mimeType || 'image/jpeg';
          await this.sendStream(link, kind, photoId, blob, mime);
        })
        .catch((err: Error) => {
          if (err instanceof ChannelClosedError) return;
          console.warn('[PhotoCrew] failed to serve', kind, photoId, err);
          link.sender.sendJSON({ t: 'request-error', kind, photoId, reason: 'Owner could not read the photo' } satisfies WireMessage).catch(noop);
        });
    }
  }

  private getPreviewBlob(photoId: string, file: File): Promise<Blob> {
    let p = this.previewCache.get(photoId);
    if (!p) {
      p = createPreview(file);
      this.previewCache.set(photoId, p);
      p.catch(() => this.previewCache.delete(photoId));
    }
    return p;
  }

  private async sendStream(link: PeerLink, kind: TransferKind, photoId: string, blob: Blob, mime: string): Promise<void> {
    const s = genId();
    const isFull = kind === 'full';
    if (isFull) this.store.bumpServing(1);
    try {
      await link.sender.sendJSON({ t: 'stream-start', s, kind, photoId, size: blob.size, mime } satisfies WireMessage);
      await link.sender.sendBlob(s, blob, link.chunkSize, { isCancelled: () => link.cancelled.has(photoId) });
    } catch (err) {
      if (err instanceof TransferCancelledError) {
        link.cancelled.delete(photoId);
        await link.sender.sendJSON({ t: 'stream-abort', s } satisfies WireMessage).catch(noop);
        return;
      }
      throw err;
    } finally {
      if (isFull) this.store.bumpServing(-1);
    }
  }

  private syncPhotoTo(link: PeerLink, meta: PhotoMeta): void {
    const thumb = this.localThumbs.get(meta.photoId);
    link.queue
      .enqueue(PRIORITY_THUMB, async () => {
        if (!this.localMeta.has(meta.photoId)) return; // unshared while queued
        await link.sender.sendJSON({ t: 'photo-meta', meta: this.localMeta.get(meta.photoId)! } satisfies WireMessage);
        if (thumb) await this.sendStream(link, 'thumb', meta.photoId, thumb, thumb.type || 'image/jpeg');
      })
      .catch(noop);
  }

  private syncAllPhotosTo(link: PeerLink): void {
    for (const meta of this.localMeta.values()) this.syncPhotoTo(link, meta);
  }

  // ───────────────────────────── local photos ─────────────────────────────

  /** Indexes photos locally: keeps File refs in memory, creates thumbnails, broadcasts metadata. */
  addFiles(fileList: File[]): void {
    const files = fileList.filter(isProbablyImage);
    if (files.length < fileList.length) this.store.pushToast({ tone: 'info', message: 'Some non-image files were ignored.' });
    if (files.length === 0) return;
    this.indexQueue.push(...files);
    this.indexTotal += files.length;
    this.store.setIndexing({ total: this.indexTotal, done: this.indexDone });
    void this.processIndexQueue();
  }

  private indexQueue: File[] = [];
  private indexTotal = 0;
  private indexDone = 0;
  private indexing = false;

  private async processIndexQueue(): Promise<void> {
    if (this.indexing) return;
    this.indexing = true;
    let failed = 0;
    let duplicates = 0;
    while (this.indexQueue.length > 0 && !this.destroyed) {
      const file = this.indexQueue.shift()!;
      const fingerprint = `${file.name}|${file.size}|${file.lastModified}`;
      if (this.fingerprints.has(fingerprint)) {
        duplicates++;
      } else {
        try {
          await this.indexOne(file, fingerprint);
        } catch (err) {
          console.warn('[PhotoCrew] could not index', file.name, err);
          failed++;
        }
      }
      this.indexDone++;
      if (!this.destroyed) this.store.setIndexing({ total: this.indexTotal, done: this.indexDone });
      await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
    }
    this.indexing = false;
    if (this.destroyed) return;
    this.indexTotal = 0;
    this.indexDone = 0;
    this.store.setIndexing(null);
    if (failed) this.store.pushToast({ tone: 'error', message: `Couldn't read ${failed} photo${failed > 1 ? 's' : ''} (unsupported format).` });
    if (duplicates) this.store.pushToast({ tone: 'info', message: `Skipped ${duplicates} already-shared photo${duplicates > 1 ? 's' : ''}.` });
  }

  private async indexOne(file: File, fingerprint: string): Promise<void> {
    const thumb = await createThumbnail(file);
    if (this.destroyed) return;
    const photoId = genId();
    const meta: PhotoMeta = {
      photoId,
      ownerPeerId: selfId,
      ownerName: this.name,
      fileName: file.name || `photo-${photoId.slice(0, 6)}.jpg`,
      fileSize: file.size,
      mimeType: guessMimeType(file),
      width: thumb.width,
      height: thumb.height,
      timestamp: file.lastModified || Date.now(),
    };
    this.fingerprints.add(fingerprint);
    this.localFiles.set(photoId, file);
    this.localThumbs.set(photoId, thumb.blob);
    this.localMeta.set(photoId, meta);
    this.store.addPhoto({ ...meta, thumbUrl: URL.createObjectURL(thumb.blob), isMine: true, downloaded: false, addedAt: Date.now() });
    for (const link of this.links.values()) if (link.ready) this.syncPhotoTo(link, meta);
  }

  removeLocalPhoto(photoId: string): void {
    const meta = this.localMeta.get(photoId);
    if (!meta) return;
    const file = this.localFiles.get(photoId);
    if (file) this.fingerprints.delete(`${file.name}|${file.size}|${file.lastModified}`);
    this.localFiles.delete(photoId);
    this.localThumbs.delete(photoId);
    this.localMeta.delete(photoId);
    this.previewCache.delete(photoId);
    this.store.removePhoto(photoId);
    for (const link of this.links.values()) {
      if (link.ready) link.sender.sendJSON({ t: 'photo-remove', photoId } satisfies WireMessage).catch(noop);
    }
  }

  // ───────────────────────────── receiving ─────────────────────────────

  /** Asks the owner for a ~1600px preview for the lightbox. For our own photos the original is used directly. */
  requestPreview(photoId: string): void {
    const photo = this.store.photos[photoId];
    if (!photo || photo.previewUrl) return;
    if (photo.isMine) {
      const file = this.localFiles.get(photoId);
      if (file) this.store.patchPhoto(photoId, { previewUrl: URL.createObjectURL(file) });
      return;
    }
    if (this.pendingPreview.has(photoId)) return;
    const link = this.links.get(photo.ownerPeerId);
    if (!link?.ready) return;
    this.pendingPreview.add(photoId);
    this.store.patchPhoto(photoId, { previewError: false });
    link.sender.sendJSON({ t: 'request', kind: 'preview', photoIds: [photoId] } satisfies WireMessage).catch(() => this.pendingPreview.delete(photoId));
  }

  isAvailable(photo: PhotoEntry): boolean {
    if (photo.isMine) return this.localFiles.has(photo.photoId);
    return !!this.links.get(photo.ownerPeerId)?.ready;
  }

  /** Pulls full-resolution originals directly from each owner. */
  async downloadPhotos(photoIds: string[]): Promise<DownloadResult> {
    if (this.store.transfer) throw new Error('A download is already in progress');
    const photos = photoIds.map((id) => this.store.photos[id]).filter((p): p is PhotoEntry => !!p);
    const available = photos.filter((p) => this.isAvailable(p));
    const skipped = photoIds.length - available.length;
    if (available.length === 0) return { files: [], failed: skipped, cancelled: false };

    this.downloadCancelled = false;
    const owners = new Set(available.filter((p) => !p.isMine).map((p) => p.ownerPeerId));
    this.store.setTransfer({
      totalFiles: available.length,
      doneFiles: 0,
      failedFiles: 0,
      totalBytes: available.reduce((sum, p) => sum + p.fileSize, 0),
      receivedBytes: 0,
      startedAt: Date.now(),
      allLocal: [...owners].every((id) => this.store.peers[id]?.link === 'local'),
    });
    this.lastProgressAt = Date.now();

    const results: (File | null)[] = new Array(available.length).fill(null);
    const byOwner = new Map<string, string[]>();

    const tasks = available.map((photo, idx) => {
      let promise: Promise<File>;
      if (photo.isMine) {
        const file = this.localFiles.get(photo.photoId)!;
        this.store.bumpTransfer({ receivedBytes: file.size });
        promise = Promise.resolve(file);
      } else {
        promise = new Promise<File>((resolve, reject) => {
          this.pendingFull.set(pendingKey(photo.ownerPeerId, photo.photoId), {
            peerId: photo.ownerPeerId,
            photoId: photo.photoId,
            resolve,
            reject,
          });
        });
        const list = byOwner.get(photo.ownerPeerId) ?? [];
        list.push(photo.photoId);
        byOwner.set(photo.ownerPeerId, list);
      }
      return promise.then(
        (file) => {
          results[idx] = file;
          this.lastProgressAt = Date.now();
          this.store.bumpTransfer({ doneFiles: 1 });
          if (!photo.isMine) this.store.patchPhoto(photo.photoId, { downloaded: true });
        },
        () => this.store.bumpTransfer({ failedFiles: 1 }),
      );
    });

    for (const [ownerId, ids] of byOwner) {
      const link = this.links.get(ownerId);
      if (!link) {
        this.rejectPendingFor(ownerId, new ChannelClosedError());
        continue;
      }
      link.sender.sendJSON({ t: 'request', kind: 'full', photoIds: ids } satisfies WireMessage).catch(() =>
        this.rejectPendingFor(ownerId, new ChannelClosedError()),
      );
    }

    const watchdog = setInterval(() => {
      if (Date.now() - this.lastProgressAt > STALL_TIMEOUT_MS) {
        this.store.pushToast({ tone: 'error', message: 'Transfer stalled — some photos could not be pulled.' });
        this.cancelDownload(false);
      }
    }, 5000);

    try {
      await Promise.all(tasks);
    } finally {
      clearInterval(watchdog);
    }

    const files = results.filter((f): f is File => !!f);
    return { files, failed: available.length - files.length + skipped, cancelled: this.downloadCancelled };
  }

  /** Stops an in-flight download and tells owners to stop streaming. */
  cancelDownload(userInitiated = true): void {
    if (userInitiated) this.downloadCancelled = true;
    const byOwner = new Map<string, string[]>();
    for (const p of this.pendingFull.values()) {
      const list = byOwner.get(p.peerId) ?? [];
      list.push(p.photoId);
      byOwner.set(p.peerId, list);
    }
    for (const [ownerId, ids] of byOwner) {
      const link = this.links.get(ownerId);
      link?.sender.sendJSON({ t: 'cancel', photoIds: ids } satisfies WireMessage).catch(noop);
      link?.assembler.abortWhere((info) => info.kind === 'full');
    }
    this.rejectAllPending(new DownloadCancelledError());
  }

  private rejectPendingFor(peerId: string, err: Error): void {
    for (const [key, p] of this.pendingFull) {
      if (p.peerId === peerId) {
        this.pendingFull.delete(key);
        p.reject(err);
      }
    }
  }

  private rejectAllPending(err: Error): void {
    const all = [...this.pendingFull.values()];
    this.pendingFull.clear();
    all.forEach((p) => p.reject(err));
  }
}
