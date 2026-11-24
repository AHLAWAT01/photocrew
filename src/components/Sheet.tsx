import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** When false the backdrop/close button can't dismiss the sheet (e.g. during a transfer). */
  dismissible?: boolean;
}

/** iOS-style bottom sheet (centered card on wide screens). */
export default function Sheet({ open, onClose, title, children, dismissible = true }: Props) {
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={dismissible ? onClose : undefined} />
      <div className="animate-sheet-up pb-safe relative w-full max-w-md rounded-t-3xl bg-surface px-5 pt-3 shadow-2xl sm:rounded-3xl sm:pb-5">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-3 sm:hidden" />
        {(title || (dismissible && onClose)) && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="display text-2xl">{title}</h2>
            {dismissible && onClose && (
              <button onClick={onClose} className="rounded-full bg-surface-2 p-1.5 text-zinc-400 active:bg-surface-3" aria-label="Close">
                <X size={18} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
