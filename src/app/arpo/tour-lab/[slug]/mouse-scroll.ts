/*
 * A row that scrolls sideways (the stories, the showcase's band) - with a
 * mouse too: the wheel turns it (a mouse has no sideways scroll), and it can
 * be dragged. A drag isn't a click on what it started on. Touch and
 * trackpads scroll it on their own already. Used as a ref callback:
 * ref={mouseScroll} (React calls the returned function when it's removed).
 */
export function mouseScroll(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return;
  const onWheel = (e: WheelEvent) => {
    if (el.scrollWidth <= el.clientWidth + 1) return;
    // A trackpad's own sideways swipe is left alone; the wheel's up/down turns the row.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0;
    if (atStart || atEnd) return;
    e.preventDefault();
    el.scrollLeft += e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
  };
  let from: { x: number; left: number } | null = null;
  let dragged = false;
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || el.scrollWidth <= el.clientWidth + 1) return;
    from = { x: e.clientX, left: el.scrollLeft };
    dragged = false;
  };
  const onMove = (e: PointerEvent) => {
    if (!from) return;
    const dx = e.clientX - from.x;
    if (!dragged && Math.abs(dx) < 5) return;
    dragged = true;
    el.scrollLeft = from.left - dx;
  };
  const onUp = () => {
    from = null;
  };
  // The click that ends a drag doesn't open the story it was let go over.
  const onClick = (e: MouseEvent) => {
    if (!dragged) return;
    dragged = false;
    e.preventDefault();
    e.stopPropagation();
  };
  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  el.addEventListener("click", onClick, true);
  return () => {
    el.removeEventListener("wheel", onWheel);
    el.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    el.removeEventListener("click", onClick, true);
  };
}
