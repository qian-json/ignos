// Written with AI assistance (Claude Code)
// The opening of /habitats: the page heading, one line on what the page is for, and NASA's PSI
// investigations as cards on the inside of a slowly turning drum. Each card names the investigation,
// its PSI number and whether it flew or was a ground study, all read from the data files.
// Scrolling turns the drum a little further (the page scrolls normally; nothing is held), and a card
// takes you to that investigation's row in the dashboard below.
// Keyboard: one tab stop; Left/Right (or Up/Down) step through the cards and bring the focused one to
// the front, Enter opens its row. Reduced motion and the Pause switch hold a still drum; it also stops
// off screen and in a hidden tab.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { investigations, cell, INVESTIGATIONS_FILE } from "../data";
import { Num } from "../Num";
import { PageHeading } from "./PageHeading";
import { motionPaused, prefersReduced, watchMotion } from "./motionState";
import "./investigation-drum.css";

const ALL = investigations.investigations;
const COUNT = ALL.length;
const STEP = 360 / COUNT;
const SPIN = 2;          // degrees per second while idle
const SCROLL_TURN = 0.025;
const EDGE_TURN = 22;      // degrees per second at the very edge when the pointer rests on a side of the drum
const EDGE_ZONE = 0.3;     // the outer 30% on each side turns it; the middle leaves it alone  // degrees per pixel scrolled
const flew = (t: string) => /flight/i.test(t);
const label = (iv: (typeof ALL)[number]) => iv.acronym || iv.full_name;

/** Find the investigation's row in the dashboard, revealing the full list first if needed. */
function goToRow(acc: string) {
  const find = () => document.querySelector<HTMLButtonElement>(`.hab-list button.inv-row[aria-controls="inv-${CSS.escape(acc)}"]`);
  const land = (btn: HTMLButtonElement) => {
    const li = btn.closest("li");
    if (btn.getAttribute("aria-expanded") !== "true") btn.click();
    const smooth = !(prefersReduced() || motionPaused());
    requestAnimationFrame(() => {
      (li ?? btn).scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
      btn.focus({ preventScroll: true });
      if (li) {
        li.setAttribute("data-drum-landed", "");
        window.setTimeout(() => li.removeAttribute("data-drum-landed"), 1800);
      }
    });
  };
  const hit = find();
  if (hit) { land(hit); return; }
  document.querySelector<HTMLButtonElement>(".hab-list ~ .inv-all")?.click();
  let tries = 0;
  const wait = () => { const b = find(); if (b) land(b); else if (tries++ < 10) requestAnimationFrame(wait); };
  requestAnimationFrame(wait);
}

export function InvestigationDrum() {
  const root = useRef<HTMLElement>(null);
  const ring = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  // the drum's angle lives outside React so turning it never re-renders the cards
  const edge = useRef(0);   // pointer across the drum, -1 (left edge) to 1 (right edge)
  const turn = useRef({ base: 0, hold: null as number | null });

  useEffect(() => {
    const el = root.current, r = ring.current;
    if (!el || !r) return;
    let raf = 0, last = 0, seen = true, shown = 0;
    const still = () => prefersReduced() || motionPaused();
    const apply = () => {
      const t = turn.current;
      // only the first viewport of scroll turns the drum; past that it simply scrolls away
      const scrolled = Math.max(0, Math.min(window.innerHeight, window.scrollY));
      const a = t.hold ?? t.base + (still() ? 0 : scrolled * SCROLL_TURN);
      shown += (a - shown) * (still() ? 1 : 0.05);
      r.style.setProperty("--drum-turn", `${-shown}deg`);
    };
    const tick = (now: number) => {
      raf = 0;
      if (still() || !seen || document.hidden) { last = 0; apply(); return; }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
      if (turn.current.hold === null) {
        const e = edge.current;
        const push = Math.abs(e) > 1 - EDGE_ZONE * 2 ? Math.sign(e) * (Math.abs(e) - (1 - EDGE_ZONE * 2)) / (EDGE_ZONE * 2) : 0;
        turn.current.base += (push ? push * EDGE_TURN : SPIN) * dt;
      }
      apply();
      raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; kick(); });
    io.observe(el);
    const onScroll = () => { if (still()) apply(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    const stop = watchMotion(kick);
    apply(); kick();
    return () => { cancelAnimationFrame(raf); io.disconnect(); stop(); window.removeEventListener("scroll", onScroll); };
  }, []);

  // bring a card to the front and keep it there while it has focus or the pointer
  const hold = (i: number | null) => {
    const t = turn.current;
    if (i === null) { if (t.hold !== null) t.base = t.hold - Math.max(0, Math.min(window.innerHeight, window.scrollY)) * SCROLL_TURN; t.hold = null; return; }
    const target = i * STEP;
    const cur = t.hold ?? t.base;
    t.hold = cur + ((((target - cur) % 360) + 540) % 360) - 180;
    if (prefersReduced() || motionPaused()) ring.current?.style.setProperty("--drum-turn", `${-t.hold}deg`);
  };

  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "Home" ? -active : e.key === "End" ? COUNT - 1 - active : 0;
    if (!d) return;
    e.preventDefault();
    const n = (active + d + COUNT) % COUNT;
    setActive(n);
    ring.current?.querySelectorAll<HTMLButtonElement>("button")[n]?.focus({ preventScroll: true });
  };

  const countSrc = { ...cell(INVESTIGATIONS_FILE, 0, "investigations"), derived: "number of records in the list" };

  return (
    <header className="drum-open" data-element="investigation-drum" ref={root} aria-labelledby="habitats-title">
      <div className="drum-words">
        <PageHeading as="h1" meta="Where it burns" className="t-display-xl" id="habitats-title">Habitats</PageHeading>
        <p className="drum-line">Pick where a crew will live; see which of NASA's <Num source={countSrc}>{COUNT}</Num> PSI investigations tell you most about a fire there.</p>
      </div>
      <div className="drum-stage" onPointerMove={(ev) => { if (ev.pointerType !== "mouse") return; const b = ev.currentTarget.getBoundingClientRect(); edge.current = ((ev.clientX - b.left) / b.width) * 2 - 1; }} onPointerLeave={() => { edge.current = 0; }}>
        <ul className="drum-ring" ref={ring} aria-label={`NASA's PSI investigations, ${COUNT} cards; arrow keys move, Enter opens its row below`} onKeyDown={onKey}>
          {ALL.map((iv, i) => {
            const fl = flew(iv.investigation_type);
            return (
              <li key={iv.accession} className="drum-slot" style={{ "--drum-at": `${i * STEP}deg` } as CSSProperties}>
                <button
                  type="button"
                  className="drum-card"
                  tabIndex={i === active ? 0 : -1}
                  data-kind={fl ? "flight" : "ground"}
                  onFocus={() => { setActive(i); hold(i); }}
                  onBlur={() => hold(null)}
                  onClick={() => goToRow(iv.accession)}
                  aria-label={`${label(iv)}, ${iv.accession}, ${fl ? "flight" : "ground"}: go to its row`}
                >
                  <span className="drum-name">{label(iv)}</span>
                  <span className="drum-id">{iv.accession}</span>
                  <span className="drum-tag">{fl ? "flight" : "ground"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </header>
  );
}
