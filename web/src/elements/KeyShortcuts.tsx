// Written with AI assistance (Claude Code)
// Single-key shortcuts for people who move around the page from the keyboard: "/" asks a question,
// "g" then a letter jumps to a section, "p" pauses or plays all motion, "?" opens a sheet that lists
// them. The sheet is written from the same table the handler reads, so it can't list a key that
// doesn't work. Its switch turns single keys off (remembered on this device); the footer button
// still opens the sheet when they are off. Keys typed in a field, held with Ctrl, Cmd or Alt, or
// pressed while a dialog is open are left alone.
import { useEffect, useRef, useState } from "react";
import { useMotion } from "../motion";
import { prefersReduced } from "./motionState";
import { hrefFor } from "../router/routes";
import { currentPage, navigate } from "../router/router";
import "./key-shortcuts.css";

const STORE = "ignos:shortcuts";
const TYPING = "input, textarea, select, [contenteditable]:not([contenteditable=false])";
/** The letter after "g" for each section, by section id. */
const LETTERS: Record<string, string> = { habitats: "h", ask: "a", research: "d", overview: "d", measure: "f", orbit: "o", moon: "m", model: "l", method: "w" };

const readOn = () => { try { return localStorage.getItem(STORE) !== "off"; } catch { return true; } };
const writeOn = (on: boolean) => { try { localStorage.setItem(STORE, on ? "on" : "off"); } catch { /* private mode: lasts this page only */ } };

/** Go to a section on whichever page it lives (the router moves focus to its heading). */
const jumpTo = (id: string) => void navigate(hrefFor(id));

/** "/" from anywhere: the top bar's box when it is shown (it handles the key itself), else the Ask block's. */
function askBox(): HTMLInputElement | null {
  const bar = document.querySelector<HTMLInputElement>(".askbar input");
  if (bar && bar.offsetParent !== null) return null;
  return document.querySelector<HTMLInputElement>("#ask input[type=search]");
}

export function KeyShortcuts({ sections }: { sections: readonly (readonly [string, string])[] }) {
  const { paused, setPaused } = useMotion();
  const [on, setOn] = useState(readOn);
  const sheet = useRef<HTMLDialogElement>(null);
  const live = useRef({ on, paused, setPaused });
  live.current = { on, paused, setPaused };
  const jumps = sections.filter(([id]) => LETTERS[id]).map(([id, label]) => ({ id, label, key: LETTERS[id] }));

  useEffect(() => { document.documentElement.dataset.shortcuts = on ? "on" : "off"; }, [on]);

  useEffect(() => {
    let pending = 0;          // "g" was pressed: the next letter jumps (for 1.5 s)
    const clearG = () => { clearTimeout(pending); pending = 0; };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t && (t.closest(TYPING) || (t as HTMLElement).isContentEditable)) return;
      const modal = document.querySelector("dialog[open]");
      if (modal) {
        if (modal === sheet.current && e.key === "?" && live.current.on) { e.preventDefault(); sheet.current.close(); }
        return;
      }
      if (e.key.length !== 1 || e.key === " ") return;
      if (!live.current.on) {
        // off means off: the top bar's own "/" stays quiet too
        if (e.key === "/") e.stopPropagation();
        clearG();
        return;
      }
      const k = e.key.toLowerCase();
      if (pending) {
        clearG();
        const hit = jumps.find((j) => j.key === k);
        if (hit) { e.preventDefault(); jumpTo(hit.id); }
        return;
      }
      if (e.repeat) return;
      if (e.key === "?") { e.preventDefault(); sheet.current?.showModal(); return; }
      if (e.key === "/") {
        const box = askBox();
        if (box) { e.preventDefault(); box.scrollIntoView({ behavior: prefersReduced() ? "auto" : "smooth", block: "center" }); box.focus({ preventScroll: true }); }
        else if (!document.querySelector(".askbar input") || (document.querySelector(".askbar input") as HTMLElement).offsetParent === null) {
          // no box on this page: open the Ask page, then its box
          if (currentPage() !== "ask") { e.preventDefault(); void navigate(hrefFor("ask")).then(() => askBox()?.focus()); }
        }
        return;
      }
      if (k === "g") { e.preventDefault(); pending = window.setTimeout(clearG, 1500); return; }
      if (k === "p") { e.preventDefault(); live.current.setPaused(!live.current.paused); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); clearG(); };
  }, []);     // the jump table comes from the section list, which never changes

  const toggle = () => { const next = !on; setOn(next); writeOn(next); };
  const row = (keys: string[], label: string, char = true) => (
    <div className="keys-row" data-char={char ? "" : undefined} key={label}>
      <dt>{keys.map((k, i) => <span key={i}>{i > 0 && <span className="keys-then"> then </span>}<kbd>{k}</kbd></span>)}</dt>
      <dd>{label}</dd>
    </div>
  );

  return (
    <span data-element="key-shortcuts">
      <button type="button" className="keys-open" aria-haspopup="dialog" onClick={() => sheet.current?.showModal()}>Keyboard shortcuts</button>
      <dialog ref={sheet} className="keys-sheet" aria-labelledby="keys-h" onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className="keys-inner">
          <div className="keys-head">
            <h2 id="keys-h">Keys</h2>
            <button type="button" className="keys-close" onClick={() => sheet.current?.close()}>Close</button>
          </div>
          <div className="keys-list">
            <section>
              <h3>Go to</h3>
              <dl>{jumps.map((j) => row(["G", j.key.toUpperCase()], j.label))}</dl>
            </section>
            <section>
              <h3>Do</h3>
              <dl>
                {row(["/"], "Ask a question")}
                {row(["P"], paused ? "Play motion" : "Pause all motion")}
                {row(["?"], "Open this sheet")}
                {row(["Esc"], "Close this sheet", false)}
              </dl>
            </section>
          </div>
          <button type="button" className="keys-switch" aria-pressed={on} onClick={toggle}>
            <span className="keys-track" aria-hidden="true" />
            <span>Single-key shortcuts<span aria-hidden="true">: {on ? "on" : "off"}</span></span>
          </button>
        </div>
      </dialog>
    </span>
  );
}
