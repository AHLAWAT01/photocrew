import { useState, type FormEvent } from 'react';
import { ArrowRight, CircleAlert, Dices } from 'lucide-react';
import { MAX_NAME_LENGTH, ROOM_CODE_LENGTH, generateRoomCode, isValidRoomCode, normalizeRoomCode, randomName, sanitizeName } from '../utils/names';

interface Props {
  name: string;
  onNameChange: (name: string) => void;
  onEnter: (roomCode: string, name: string) => void;
}

export default function Lobby({ name, onNameChange, onEnter }: Props) {
  const [code, setCode] = useState('');
  const validCode = isValidRoomCode(code);
  const finalName = sanitizeName(name);

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (validCode) onEnter(code, finalName);
  };

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-6xl flex-col px-5 sm:px-8">
      <a href="../" className="flex items-center gap-2 self-start py-5 text-lg font-semibold tracking-tight">
        <img src="../favicon.svg" alt="" className="h-7 w-7" /> PhotoCrew
      </a>

      <div className="grid flex-1 content-center gap-10 py-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end lg:gap-20">
        <div>
          <h1 className="display text-[clamp(2.6rem,13.5vw,6.2rem)] lg:text-[clamp(4.6rem,7.6vw,6.6rem)]">
            <span className="flex justify-between"><span>Who's</span><span>in</span></span>
            <span className="flex justify-between"><span>your</span><span>crew?</span></span>
          </h1>
          <p className="mt-5 max-w-md font-serif text-xl leading-snug text-zinc-300 italic">
            Share photos with your group. No cloud, no hassle, completely free.
          </p>
        </div>

        <div className="w-full max-w-lg">
          {!window.isSecureContext && (
            <div className="mb-5 flex gap-3 rounded-lg bg-danger/15 p-4 text-sm text-red-200">
              <CircleAlert size={18} className="mt-0.5 shrink-0 text-danger" />
              <p>This page isn't on HTTPS, so sharing won't work. Open the address that starts with <b>https://</b>.</p>
            </div>
          )}

          <label htmlFor="name" className="mb-1.5 block text-sm text-zinc-400">Your name</label>
          <div className="mb-6 flex items-center border-b border-surface-3 focus-within:border-bone">
            <input
              id="name"
              value={name}
              onChange={(e) => onNameChange(e.target.value.slice(0, MAX_NAME_LENGTH))}
              placeholder="Display name"
              autoComplete="nickname"
              className="min-w-0 flex-1 bg-transparent py-3 text-2xl tracking-tight outline-none placeholder:text-zinc-600"
            />
            <button onClick={() => onNameChange(randomName())} className="p-2.5 text-zinc-400 active:text-bone" aria-label="Random name">
              <Dices size={22} />
            </button>
          </div>

          <button
            onClick={() => onEnter(generateRoomCode(), finalName)}
            className="flex w-full items-center justify-between rounded-lg bg-bone px-5 py-5 text-lg font-semibold text-ink active:bg-white"
          >
            Create Room <ArrowRight size={22} />
          </button>

          <form onSubmit={join} className="mt-3 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
              placeholder="CODE"
              aria-label="Room code"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={ROOM_CODE_LENGTH}
              className="display min-w-0 flex-1 rounded-lg border border-surface-3 bg-transparent px-5 py-4 text-3xl outline-none placeholder:text-zinc-600 focus:border-bone"
            />
            <button type="submit" disabled={!validCode} className="rounded-lg border border-bone px-5 text-lg font-semibold whitespace-nowrap active:bg-bone active:text-ink disabled:border-surface-3 disabled:text-zinc-500">
              Join Room
            </button>
          </form>

          <p className="mt-6 text-sm leading-relaxed text-zinc-400">
            Your photos stay on your device until someone in your room picks them. Works best when everyone is on the same Wi-Fi.
          </p>
        </div>
      </div>
    </main>
  );
}
