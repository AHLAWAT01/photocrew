/**
 * Chunked binary transfer over an RTCDataChannel with backpressure.
 *
 * Wire format for binary frames:
 *   [uint32 headerLength][header JSON (utf-8)][payload bytes]
 * The header identifies the stream and chunk index, so frames from different
 * streams (thumbnails, previews, full files) can safely share one channel.
 */
import type { TransferKind } from '../types';

export const CHUNK_SIZE = 64 * 1024;
/** Fire `bufferedamountlow` once the outgoing buffer drains below this. */
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 256 * 1024;
/** Stop queueing new chunks once the buffer holds this much. Keeps mobile memory flat. */
export const BUFFERED_AMOUNT_HIGH_WATER = 1024 * 1024;
const FRAME_HEADER_RESERVE = 512;
const MAX_HEADER_BYTES = 1024;

export interface ChunkHeader {
  s: string;
  i: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeFrame(header: ChunkHeader, payload: ArrayBuffer): ArrayBuffer {
  const h = encoder.encode(JSON.stringify(header));
  const out = new Uint8Array(4 + h.byteLength + payload.byteLength);
  new DataView(out.buffer).setUint32(0, h.byteLength);
  out.set(h, 4);
  out.set(new Uint8Array(payload), 4 + h.byteLength);
  return out.buffer;
}

export function decodeFrame(buffer: ArrayBuffer): { header: ChunkHeader; payload: Uint8Array<ArrayBuffer> } | null {
  if (buffer.byteLength < 4) return null;
  const len = new DataView(buffer).getUint32(0);
  if (len === 0 || len > MAX_HEADER_BYTES || 4 + len > buffer.byteLength) return null;
  try {
    const header = JSON.parse(decoder.decode(new Uint8Array(buffer, 4, len))) as ChunkHeader;
    if (typeof header?.s !== 'string' || typeof header?.i !== 'number') return null;
    return { header, payload: new Uint8Array(buffer, 4 + len) };
  } catch {
    return null;
  }
}

/**
 * 64KB payloads unless the negotiated SCTP max message size is smaller
 * (some older Safari builds cap messages at 64KB including our header).
 */
export function resolveChunkSize(pc?: RTCPeerConnection | null): number {
  const max = pc?.sctp?.maxMessageSize;
  if (typeof max === 'number' && max > 0 && Number.isFinite(max) && max < CHUNK_SIZE + FRAME_HEADER_RESERVE) {
    return Math.max(16 * 1024, max - FRAME_HEADER_RESERVE);
  }
  return CHUNK_SIZE;
}

export class ChannelClosedError extends Error {
  constructor() {
    super('Data channel closed');
    this.name = 'ChannelClosedError';
  }
}

export class TransferCancelledError extends Error {
  constructor() {
    super('Transfer cancelled');
    this.name = 'TransferCancelledError';
  }
}

export interface SendBlobOptions {
  onProgress?: (bytesSent: number) => void;
  isCancelled?: () => boolean;
}

/** Wraps a data channel so every send respects `bufferedAmount` backpressure. */
export class BackpressureSender {
  constructor(private readonly channel: RTCDataChannel) {
    channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
  }

  get isOpen(): boolean {
    return this.channel.readyState === 'open';
  }

  private waitForDrain(): Promise<void> {
    const ch = this.channel;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        ch.removeEventListener('bufferedamountlow', onLow);
        ch.removeEventListener('close', onClose);
        clearInterval(poll);
        if (err) reject(err);
        else resolve();
      };
      const onLow = () => finish();
      const onClose = () => finish(new ChannelClosedError());
      // Safety net: some mobile WebViews occasionally drop `bufferedamountlow`.
      const poll = setInterval(() => {
        if (ch.readyState !== 'open') onClose();
        else if (ch.bufferedAmount <= BUFFERED_AMOUNT_LOW_THRESHOLD) onLow();
      }, 250);
      ch.addEventListener('bufferedamountlow', onLow);
      ch.addEventListener('close', onClose);
    });
  }

  async send(data: string | ArrayBuffer): Promise<void> {
    if (!this.isOpen) throw new ChannelClosedError();
    if (this.channel.bufferedAmount > BUFFERED_AMOUNT_HIGH_WATER) await this.waitForDrain();
    if (!this.isOpen) throw new ChannelClosedError();
    if (typeof data === 'string') this.channel.send(data);
    else this.channel.send(data);
  }

  sendJSON(message: unknown): Promise<void> {
    return this.send(JSON.stringify(message));
  }

  /** Streams a Blob/File in fixed-size chunks, reading lazily via `blob.slice()`. */
  async sendBlob(streamId: string, blob: Blob, chunkSize: number, opts: SendBlobOptions = {}): Promise<void> {
    let offset = 0;
    let index = 0;
    while (offset < blob.size) {
      if (opts.isCancelled?.()) throw new TransferCancelledError();
      const end = Math.min(offset + chunkSize, blob.size);
      const chunk = await blob.slice(offset, end).arrayBuffer();
      await this.send(encodeFrame({ s: streamId, i: index }, chunk));
      offset = end;
      index++;
      opts.onProgress?.(offset);
    }
  }
}

interface QueuedTask {
  priority: number;
  seq: number;
  run: () => Promise<void>;
  reject: (err: Error) => void;
}

/**
 * Serializes outgoing streams per peer. Lower priority number runs first, so
 * lightbox previews (0) jump ahead of thumbnails (1) and full files (2).
 */
export class PrioritySendQueue {
  private tasks: QueuedTask[] = [];
  private running = false;
  private closed = false;
  private seq = 0;

  enqueue(priority: number, task: () => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.closed) {
        reject(new ChannelClosedError());
        return;
      }
      this.tasks.push({
        priority,
        seq: this.seq++,
        reject,
        run: async () => {
          try {
            await task();
            resolve();
          } catch (err) {
            reject(err as Error);
          }
        },
      });
      this.tasks.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.tasks.length > 0 && !this.closed) {
      const next = this.tasks.shift()!;
      await next.run();
    }
    this.running = false;
  }

  close(): void {
    this.closed = true;
    const pending = this.tasks.splice(0);
    pending.forEach((t) => t.reject(new ChannelClosedError()));
  }
}

export interface IncomingStreamInfo {
  s: string;
  kind: TransferKind;
  photoId: string;
  size: number;
  mime: string;
}

export interface StreamProgress {
  info: IncomingStreamInfo;
  received: number;
  delta: number;
  /** Present once every byte has arrived. */
  blob?: Blob;
}

/** Reassembles incoming chunk frames into Blobs. */
export class StreamAssembler {
  private streams = new Map<string, { info: IncomingStreamInfo; parts: Uint8Array<ArrayBuffer>[]; received: number }>();

  /** Returns a completed (empty) result immediately for zero-byte streams. */
  start(info: IncomingStreamInfo): StreamProgress | null {
    if (info.size <= 0) return { info, received: 0, delta: 0, blob: new Blob([], { type: info.mime }) };
    this.streams.set(info.s, { info, parts: [], received: 0 });
    return null;
  }

  push(buffer: ArrayBuffer): StreamProgress | null {
    const frame = decodeFrame(buffer);
    if (!frame) return null;
    const stream = this.streams.get(frame.header.s);
    if (!stream) return null; // aborted or unknown stream: drop silently
    stream.parts.push(frame.payload);
    stream.received += frame.payload.byteLength;
    const delta = frame.payload.byteLength;
    if (stream.received >= stream.info.size) {
      this.streams.delete(frame.header.s);
      return { info: stream.info, received: stream.received, delta, blob: new Blob(stream.parts, { type: stream.info.mime }) };
    }
    return { info: stream.info, received: stream.received, delta };
  }

  abort(streamId: string): IncomingStreamInfo | undefined {
    const s = this.streams.get(streamId);
    this.streams.delete(streamId);
    return s?.info;
  }

  abortWhere(predicate: (info: IncomingStreamInfo) => boolean): void {
    for (const [id, s] of this.streams) if (predicate(s.info)) this.streams.delete(id);
  }

  clear(): void {
    this.streams.clear();
  }
}
