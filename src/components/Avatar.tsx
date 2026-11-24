import { colorForId, initials } from '../utils/names';

interface Props {
  id: string;
  name: string;
  size?: number;
  online?: boolean;
  showStatus?: boolean;
  className?: string;
}

export default function Avatar({ id, name, size = 32, online = true, showStatus = false, className = '' }: Props) {
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }} title={name}>
      <div
        className={`flex h-full w-full items-center justify-center rounded-full font-semibold text-ink ring-2 ring-ink ${online ? '' : 'opacity-40 grayscale'}`}
        style={{ background: colorForId(id), fontSize: Math.max(10, size * 0.38) }}
      >
        {initials(name)}
      </div>
      {showStatus && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 block rounded-full ring-2 ring-ink ${online ? 'bg-success' : 'bg-zinc-500'}`}
          style={{ width: Math.max(8, size * 0.3), height: Math.max(8, size * 0.3) }}
        />
      )}
    </div>
  );
}
