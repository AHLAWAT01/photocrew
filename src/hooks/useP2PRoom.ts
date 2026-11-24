import { useEffect, useMemo, useRef } from 'react';
import { RoomEngine } from '../lib/roomEngine';
import type { DownloadResult } from '../types';

export interface P2PRoomApi {
  addFiles: (files: File[]) => void;
  removePhoto: (photoId: string) => void;
  requestPreview: (photoId: string) => void;
  downloadPhotos: (photoIds: string[]) => Promise<DownloadResult>;
  cancelDownload: () => void;
  setName: (name: string) => void;
}

/**
 * Joins a PhotoCrew room for the lifetime of the component.
 * All state flows into the zustand store (useRoomStore); this hook returns
 * a stable set of imperative actions.
 */
export function useP2PRoom(roomCode: string, initialName: string): P2PRoomApi {
  const engineRef = useRef<RoomEngine | null>(null);
  const nameRef = useRef(initialName);

  useEffect(() => {
    const engine = new RoomEngine(roomCode, nameRef.current);
    engineRef.current = engine;
    engine.join();
    return () => {
      engine.leave();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [roomCode]);

  return useMemo<P2PRoomApi>(
    () => ({
      addFiles: (files) => engineRef.current?.addFiles(files),
      removePhoto: (id) => engineRef.current?.removeLocalPhoto(id),
      requestPreview: (id) => engineRef.current?.requestPreview(id),
      downloadPhotos: (ids) =>
        engineRef.current ? engineRef.current.downloadPhotos(ids) : Promise.resolve({ files: [], failed: ids.length, cancelled: false }),
      cancelDownload: () => engineRef.current?.cancelDownload(),
      setName: (name) => {
        nameRef.current = name;
        engineRef.current?.setName(name);
      },
    }),
    [],
  );
}
