import { useCallback, useState } from 'react';
import Lobby from './components/Lobby';
import RoomView from './components/RoomView';
import Toaster from './components/Toaster';
import { isValidRoomCode, loadDisplayName, normalizeRoomCode, randomName, saveDisplayName } from './utils/names';

interface Session {
  roomCode: string;
  name: string;
}

function roomFromUrl(): string | null {
  const code = normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? '');
  return isValidRoomCode(code) ? code : null;
}

function setRoomInUrl(code: string | null) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}

export default function App() {
  const [name, setName] = useState(() => loadDisplayName() ?? randomName());
  // Auto-join when opened from a shared link / QR code (?room=XXXX).
  const [session, setSession] = useState<Session | null>(() => {
    const code = roomFromUrl();
    return code ? { roomCode: code, name: loadDisplayName() ?? name } : null;
  });

  const enterRoom = useCallback((roomCode: string, displayName: string) => {
    saveDisplayName(displayName);
    setName(displayName);
    setRoomInUrl(roomCode);
    setSession({ roomCode, name: displayName });
  }, []);

  const leaveRoom = useCallback(() => {
    setRoomInUrl(null);
    setSession(null);
  }, []);

  const rename = useCallback((displayName: string) => {
    saveDisplayName(displayName);
    setName(displayName);
  }, []);

  return (
    <>
      {session ? (
        <RoomView key={session.roomCode} roomCode={session.roomCode} initialName={session.name} onLeave={leaveRoom} onRename={rename} />
      ) : (
        <Lobby name={name} onNameChange={setName} onEnter={enterRoom} />
      )}
      <Toaster />
    </>
  );
}
