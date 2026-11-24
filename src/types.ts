export type TransferKind = 'thumb' | 'preview' | 'full';

/** Metadata broadcast for every pooled photo. The original File never leaves the owner until requested. */
export interface PhotoMeta {
  photoId: string;
  ownerPeerId: string;
  ownerName: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  width: number;
  height: number;
  timestamp: number;
}

export interface PhotoEntry extends PhotoMeta {
  thumbUrl?: string;
  previewUrl?: string;
  previewError?: boolean;
  isMine: boolean;
  downloaded: boolean;
  addedAt: number;
}

/** How the selected ICE candidate pair reaches the peer. */
export type LinkType = 'local' | 'internet' | 'relay' | 'unknown';

export interface PeerInfo {
  id: string;
  name: string;
  /** WebRTC peer connection is alive. */
  connected: boolean;
  /** PhotoCrew data channel handshake finished. */
  ready: boolean;
  link: LinkType;
  joinedAt: number;
}

export interface TransferState {
  totalFiles: number;
  doneFiles: number;
  failedFiles: number;
  totalBytes: number;
  receivedBytes: number;
  startedAt: number;
  /** True when every owner involved is reachable over the local network. */
  allLocal: boolean;
}

export interface DownloadResult {
  files: File[];
  failed: number;
  cancelled: boolean;
}

/** Control messages sent as JSON strings over the PhotoCrew data channel. */
export type WireMessage =
  | { t: 'hello'; name: string; ack: boolean }
  | { t: 'photo-meta'; meta: PhotoMeta }
  | { t: 'photo-remove'; photoId: string }
  | { t: 'request'; kind: 'preview' | 'full'; photoIds: string[] }
  | { t: 'cancel'; photoIds: string[] }
  | { t: 'stream-start'; s: string; kind: TransferKind; photoId: string; size: number; mime: string }
  | { t: 'stream-abort'; s: string }
  | { t: 'request-error'; kind: 'preview' | 'full'; photoId: string; reason: string };
