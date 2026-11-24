import { useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore';
import type { LinkType } from '../types';
import { MAX_NAME_LENGTH, sanitizeName } from '../utils/names';
import Avatar from './Avatar';
import Sheet from './Sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
}

const LINK_LABEL: Record<LinkType, string> = {
  local: 'Local Wi-Fi • Ultra fast',
  internet: 'P2P via Internet',
  relay: 'Relayed',
  unknown: 'Connecting…',
};

export default function PeopleSheet({ open, onClose, onRename }: Props) {
  const peers = useRoomStore((s) => s.peers);
  const photos = useRoomStore((s) => s.photos);
  const selfId = useRoomStore((s) => s.selfId);
  const selfName = useRoomStore((s) => s.selfName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(selfName);

  const counts: Record<string, number> = {};
  Object.values(photos).forEach((p) => (counts[p.ownerPeerId] = (counts[p.ownerPeerId] ?? 0) + 1));
  const list = Object.values(peers).sort((a, b) => Number(b.connected) - Number(a.connected) || a.joinedAt - b.joinedAt);

  const save = () => {
    const name = sanitizeName(draft);
    onRename(name);
    setEditing(false);
  };

  return (
    <Sheet open={open} onClose={onClose} title="The crew">
      <ul className="max-h-[60dvh] space-y-1 overflow-y-auto pb-2">
        <li className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <Avatar id={selfId} name={selfName} size={40} showStatus />
          {editing ? (
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_NAME_LENGTH))}
                className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2 outline-none focus:ring-1 focus:ring-accent"
              />
              <button type="submit" className="rounded-lg bg-bone px-3 text-ink" aria-label="Save name">
                <Check size={18} />
              </button>
            </form>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{selfName} <span className="font-normal text-zinc-500">(you)</span></p>
                <p className="text-xs text-zinc-400">{counts[selfId] ?? 0} photos shared</p>
              </div>
              <button
                onClick={() => {
                  setDraft(selfName);
                  setEditing(true);
                }}
                className="rounded-full p-2 text-zinc-400 active:bg-surface-3"
                aria-label="Rename"
              >
                <Pencil size={16} />
              </button>
            </>
          )}
        </li>
        {list.length === 0 && <li className="p-4 text-center text-sm text-zinc-500">No one else yet — share the QR code!</li>}
        {list.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-2xl p-3">
            <Avatar id={p.id} name={p.name} size={40} online={p.connected} showStatus />
            <div className="min-w-0 flex-1">
              <p className={`truncate font-semibold ${p.connected ? '' : 'text-zinc-500'}`}>{p.name}</p>
              <p className={`text-xs ${!p.connected ? 'text-zinc-500' : p.link === 'local' ? 'text-success' : 'text-zinc-400'}`}>
                {p.connected ? LINK_LABEL[p.link] : 'Offline'} · {counts[p.id] ?? 0} photos
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
