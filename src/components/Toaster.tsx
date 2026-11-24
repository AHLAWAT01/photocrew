import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useRoomStore } from '../store/useRoomStore';

export default function Toaster() {
  const toasts = useRoomStore((s) => s.toasts);
  const dismiss = useRoomStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
      {toasts.map((t) => {
        const Icon = t.tone === 'error' ? CircleAlert : t.tone === 'success' ? CircleCheck : Info;
        const color = t.tone === 'error' ? 'text-danger' : t.tone === 'success' ? 'text-success' : 'text-accent';
        return (
          <div key={t.id} className="animate-pop glass pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 shadow-xl ring-1 ring-white/10">
            <Icon size={18} className={`shrink-0 ${color}`} />
            <p className="flex-1 text-sm leading-snug">{t.message}</p>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="shrink-0 rounded-md bg-bone px-3 py-1.5 text-xs font-semibold text-ink"
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} className="shrink-0 text-zinc-500" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
