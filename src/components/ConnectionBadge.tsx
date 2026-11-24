import { Globe, Radio, Zap } from 'lucide-react';
import type { PeerInfo } from '../types';

export default function ConnectionBadge({ peers }: { peers: PeerInfo[] }) {
  const online = peers.filter((p) => p.connected);
  if (online.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
        <Radio size={12} className="animate-pulse" /> Waiting for your crew
      </span>
    );
  }
  const local = online.filter((p) => p.link === 'local').length;
  if (local > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success">
        <Zap size={12} fill="currentColor" /> Local Wi-Fi Direct • Ultra Fast
        {local < online.length && <span className="font-normal opacity-80">({local}/{online.length})</span>}
      </span>
    );
  }
  const relay = online.some((p) => p.link === 'relay');
  const unknown = online.every((p) => p.link === 'unknown');
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-warn/15 px-2.5 py-1 text-[11px] font-semibold text-warn">
      <Globe size={12} /> {unknown ? 'Checking connection…' : relay ? 'Relayed connection' : 'P2P via Internet'}
    </span>
  );
}
