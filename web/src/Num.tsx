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

export function Num({ children, source, label }: { children: ReactNode; source: NumberSource; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return; setOpen(false); };
    window.addEventListener("scroll", close, { passive: true, once: true });
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("scroll", close); window.removeEventListener("keydown", close); };
  }, [open]);
  const show = () => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ x: Math.min(r.left, window.innerWidth - 376), y: r.bottom + 8 });
    setOpen(true);
  };
  return (
    <>
      <button ref={ref} type="button" className="src" aria-label={label} onMouseEnter={show} onMouseLeave={() => setOpen(false)} onFocus={show} onBlur={() => setOpen(false)} onClick={() => (open ? setOpen(false) : show())}>
        {children}
      </button>
      {open && (
        <div className="pop" role="tooltip" style={{ left: Math.max(8, pos.x), top: pos.y }}>
          <SourceCard source={source} />
        </div>
      )}
    </>
  );
}
