import { useCallback, useEffect, useRef, type RefObject } from 'react';

const LONG_PRESS_MS = 380;
const MOVE_TOLERANCE_PX = 10;
const EDGE_SCROLL_PX = 90;
const EDGE_SCROLL_SPEED = 14;

interface Options {
  isSelected: (id: string) => boolean;
  applySelection: (updates: Record<string, boolean>) => void;
}

/**
 * Apple Photos-style long-press + drag multi-select.
 * Long-press a card, then drag across others: everything between the first
 * card and the card under your finger takes the same selected state.
 * Cards must carry `data-photo-id` (and `data-selectable="false"` to opt out).
 */
export function useDragSelect(containerRef: RefObject<HTMLElement | null>, { isSelected, applySelection }: Options) {
  const optsRef = useRef({ isSelected, applySelection });
  optsRef.current = { isSelected, applySelection };
  const suppressClickUntil = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = false;
    let start = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };
    let anchorId: string | null = null;
    let mode = true;
    let ids: string[] = [];
    let snapshot = new Map<string, boolean>();
    let prevRange = new Set<string>();
    let scrollRaf = 0;

    const cardAt = (x: number, y: number): HTMLElement | null =>
      (document.elementFromPoint(x, y)?.closest('[data-photo-id]') as HTMLElement | null) ?? null;

    const selectableIds = () =>
      Array.from(container.querySelectorAll<HTMLElement>('[data-photo-id]'))
        .filter((el) => el.dataset.selectable !== 'false')
        .map((el) => el.dataset.photoId!);

    const updateRange = (x: number, y: number) => {
      const card = cardAt(x, y);
      const id = card?.dataset.photoId;
      if (!id || !anchorId) return;
      const a = ids.indexOf(anchorId);
      const b = ids.indexOf(id);
      if (a < 0 || b < 0) return;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const range = new Set(ids.slice(lo, hi + 1));
      const updates: Record<string, boolean> = {};
      prevRange.forEach((pid) => {
        if (!range.has(pid)) updates[pid] = snapshot.get(pid) ?? false;
      });
      range.forEach((pid) => (updates[pid] = mode));
      prevRange = range;
      optsRef.current.applySelection(updates);
    };

    const autoScroll = () => {
      if (!active) return;
      const h = window.innerHeight;
      let dy = 0;
      if (last.y < EDGE_SCROLL_PX) dy = -EDGE_SCROLL_SPEED;
      else if (last.y > h - EDGE_SCROLL_PX - 80) dy = EDGE_SCROLL_SPEED;
      if (dy) {
        window.scrollBy(0, dy);
        updateRange(last.x, last.y);
      }
      scrollRaf = requestAnimationFrame(autoScroll);
    };

    const begin = (x: number, y: number) => {
      const card = cardAt(x, y);
      if (!card || card.dataset.selectable === 'false') return;
      anchorId = card.dataset.photoId!;
      start = { x, y };
      last = { x, y };
      timer = setTimeout(() => {
        timer = null;
        active = true;
        ids = selectableIds();
        snapshot = new Map(ids.map((id) => [id, optsRef.current.isSelected(id)]));
        mode = !optsRef.current.isSelected(anchorId!);
        prevRange = new Set();
        updateRange(start.x, start.y);
        navigator.vibrate?.(12);
        scrollRaf = requestAnimationFrame(autoScroll);
      }, LONG_PRESS_MS);
    };

    /** Returns true when the move should be swallowed (drag-select in progress). */
    const move = (x: number, y: number): boolean => {
      last = { x, y };
      if (timer && Math.hypot(x - start.x, y - start.y) > MOVE_TOLERANCE_PX) {
        clearTimeout(timer);
        timer = null;
      }
      if (!active) return false;
      updateRange(x, y);
      return true;
    };

    const end = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (active) suppressClickUntil.current = Date.now() + 450;
      active = false;
      anchorId = null;
      cancelAnimationFrame(scrollRaf);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return end();
      begin(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (move(e.touches[0].clientX, e.touches[0].clientY)) e.preventDefault();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) begin(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (move(e.clientX, e.clientY)) e.preventDefault();
    };
    const onContextMenu = (e: Event) => {
      if ((e.target as HTMLElement).closest('[data-photo-id]')) e.preventDefault();
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    // Non-passive so we can stop the page from scrolling while drag-selecting.
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', end);
    container.addEventListener('touchcancel', end);
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', end);
    container.addEventListener('contextmenu', onContextMenu);

    return () => {
      end();
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', end);
      container.removeEventListener('touchcancel', end);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', end);
      container.removeEventListener('contextmenu', onContextMenu);
    };
  }, [containerRef]);

  /** Call from click handlers: true means the click was the tail of a drag and should be ignored. */
  const shouldSuppressClick = useCallback(() => Date.now() < suppressClickUntil.current, []);
  return { shouldSuppressClick };
}
