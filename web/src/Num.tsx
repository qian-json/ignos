// Written with AI assistance (Claude Code)
// A number with its source: click or focus it to see the file, row, column and checksum, or the
// paper, page and quote it came from.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { NumberSource } from "@still-air/proof";

export function SourceCard({ source }: { source: NumberSource }) {
  if ("paper" in source)
    return (
      <>
        <div><span className="k">Paper </span>{source.paper}, p. {source.page}</div>
        <div><span className="k">Quote </span>“{source.quote}”</div>
      </>
    );
  const json = source.file.endsWith(".json");
  return (
    <>
      <div><span className="k">File </span><code>{source.file}</code></div>
      {json ? (
        <div><span className="k">Path </span><code>{source.column}</code></div>
      ) : source.rows && source.rows.length > 1 ? (
        <div><span className="k">Rows </span>{source.rows.join(", ")} <span className="k">column </span><code>{source.column}</code></div>
      ) : (
        <div><span className="k">Row </span>{source.row} <span className="k">column </span><code>{source.column}</code></div>
      )}
      {source.derived && <div><span className="k">Computed </span>{source.derived}</div>}
      {source.sha256 && <div><span className="k">sha256 </span><code>{source.sha256.slice(0, 16)}…</code></div>}
    </>
  );
}

/**
 * When the source card opens and closes. Hover counts only for a real mouse: a tap fires emulated
 * hover and focus before its click, so a click that toggled would close the card the same tap opened.
 * A click (or focus) only opens it; it closes on blur, mouse leave, Escape, scroll or a tap elsewhere.
 */
export function popHandlers(show: () => void, hide: () => void) {
  return {
    onPointerEnter: (e: { pointerType: string }) => { if (e.pointerType === "mouse") show(); },
    onPointerLeave: (e: { pointerType: string }) => { if (e.pointerType === "mouse") hide(); },
    onFocus: show,
    onBlur: hide,
    onClick: show,
  };
}

export function Num({ children, source, label }: { children: ReactNode; source: NumberSource; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return; setOpen(false); };
    // a tap elsewhere closes it too (a tapped button does not always take focus, so blur may never fire)
    const away = (e: PointerEvent) => { const t = e.target as Node | null; if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false); };
    window.addEventListener("scroll", close, { passive: true, once: true });
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", away);
    return () => { window.removeEventListener("scroll", close); window.removeEventListener("keydown", close); window.removeEventListener("pointerdown", away); };
  }, [open]);
  const show = () => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ x: Math.min(r.left, window.innerWidth - 376), y: r.bottom + 8 });
    setOpen(true);
  };
  return (
    <>
      <button ref={ref} type="button" className="src" aria-label={label} {...popHandlers(show, () => setOpen(false))}>
        {children}
      </button>
      {open && (
        <div ref={popRef} className="pop" role="tooltip" style={{ left: Math.max(8, pos.x), top: pos.y }}>
          <SourceCard source={source} />
        </div>
      )}
    </>
  );
}
