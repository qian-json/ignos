// Written with AI assistance (Claude Code)
// Phones only (up to 760 px wide): the main sections sit in a bar at the bottom of the screen, near
// the thumb, with "More", which opens every section in a full-screen menu that grows as a circle out
// of the button (the menu's own bar sits exactly where this one is, so "More" becomes "Close" under
// the thumb). The bar slides away while you scroll down and comes back on any scroll up, at the end
// of the page and when focus reaches it; it waits out of sight over the opening screen (the scene and
// the headline have it to themselves) and steps aside while the on-screen keyboard is up. The page
// pads its end by the bar's height, so nothing ends under it. Reduced motion or Pause: the bar never
// slides and the menu cross-fades. Desktop: absent (the header carries the links).
import { useEffect, useRef } from "react";
import { motionPaused, prefersReduced } from "./motionState";
import { hrefFor } from "../router/routes";
import { navigate } from "../router/router";
import "./section-dock.css";

export type DockItem = readonly [id: string, label: string, also?: readonly string[]];

const PHONE = "(max-width: 760px)";
const EASE = "cubic-bezier(.77,0,.175,1)";
const RISE = "cubic-bezier(.19,1,.22,1)";
const TYPING = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]), textarea, select, [contenteditable]:not([contenteditable=false])";

export function SectionDock({ items, all, active }: { items: readonly DockItem[]; all: readonly (readonly [string, string])[]; active: string }) {
  const barRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDialogElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const bar = barRef.current, menu = menuRef.current, more = moreRef.current;
    if (!bar || !menu || !more) return;
    const html = document.documentElement;
    const phone = matchMedia(PHONE);
    const coarse = matchMedia("(pointer: coarse)");
    const still = () => prefersReduced() || motionPaused();
    const panel = menu.querySelector<HTMLElement>(".smenu-panel")!;
    const dim = menu.querySelector<HTMLElement>(".smenu-dim")!;
    const mirror = menu.querySelector<HTMLElement>(".smenu-bar")!;
    const closeBtn = menu.querySelector<HTMLButtonElement>(".smenu-close")!;

    // ---- room for the bar: html.sbar-on and --sbar-space while it is displayed ----
    let hidden = false;
    const measure = () => {
      const shown = getComputedStyle(bar).display !== "none";
      html.classList.toggle("sbar-on", shown);
      if (!shown) { html.style.removeProperty("--sbar-space"); return; }
      const r = bar.getBoundingClientRect();
      const gap = hidden ? 12 : Math.max(0, innerHeight - r.bottom);
      html.style.setProperty("--sbar-space", `${Math.ceil(r.height + gap + 12)}px`);
    };

    // ---- slide away on a scroll down, back on any scroll up, at the end, on focus, with the menu open ----
    let lastY = scrollY, travel = 0, raf = 0, focusIn = false;
    const setHidden = (h: boolean) => { if (h === hidden) return; hidden = h; bar.dataset.state = h ? "hidden" : "shown"; };
    const frame = () => {
      raf = 0;
      const y = Math.max(0, scrollY), dy = y - lastY; lastY = y;
      const atEnd = y + innerHeight >= html.scrollHeight - 96;
      // the opening screen belongs to the scene and the headline: the bar waits until you scroll on
      bar.toggleAttribute("data-opening", !!document.querySelector(".journey") && y < innerHeight * 0.5 && !focusIn && !menu.open);
      if (still() || focusIn || menu.open || y < 120 || atEnd) { travel = 0; setHidden(false); return; }
      if (dy > 0) { travel = Math.max(0, travel) + dy; if (travel > 48) setHidden(true); }
      else if (dy < 0) { travel = Math.min(0, travel) + dy; if (-travel >= 6) setHidden(false); }
    };
    const onScroll = () => { raf ||= requestAnimationFrame(frame); };
    const onFocusIn = () => { focusIn = true; bar.removeAttribute("data-opening"); setHidden(false); };
    const onFocusOut = (e: FocusEvent) => { if (!bar.contains(e.relatedTarget as Node | null)) focusIn = false; };

    // ---- the on-screen keyboard: a text field has focus and the visible area shrank (or a touch screen) ----
    const vv = window.visualViewport;
    let base = innerHeight;
    const typing = () => { const a = document.activeElement; return !!a && a !== document.body && (a as Element).matches?.(TYPING); };
    const keyboard = () => {
      if (!typing()) { base = Math.max(innerHeight, vv?.height ?? 0); bar.removeAttribute("data-kbd"); return; }
      const shrunk = vv ? vv.height < base * 0.8 : false;
      if (shrunk || coarse.matches) bar.dataset.kbd = ""; else bar.removeAttribute("data-kbd");
    };
    const onFocusChange = () => setTimeout(keyboard, 0);

    // ---- the menu: a modal <dialog>; open grows a circle from "More", close plays it backwards ----
    let anims: Animation[] = [], state: "closed" | "opening" | "open" | "closing" = "closed";
    const build = () => {
      const A: Animation[] = [];
      if (still()) { A.push(panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: "linear", fill: "both" })); return A; }
      const r = more.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 2;
      const T: KeyframeAnimationOptions = { duration: 700, easing: EASE, fill: "both" };
      A.push(panel.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${R}px at ${x}px ${y}px)` }], T));
      A.push(dim.animate([{ opacity: 0 }, { opacity: 1 }], T));
      menu.querySelectorAll<HTMLElement>(".smenu-word").forEach((w, i) => {
        const a = w.animate([{ transform: "translateY(105%)" }, { transform: "none" }], { duration: 600, delay: 250 + i * 35, easing: RISE, fill: "both" });
        (a as Animation & { word?: boolean }).word = true;
        A.push(a);
      });
      return A;
    };
    const turn = (a: Animation, rate: number) => {
      const end = Number(a.effect?.getComputedTiming().endTime ?? 0);
      const t = Math.max(0, Math.min(Number(a.currentTime ?? end), end));
      a.pause(); a.currentTime = t; a.playbackRate = rate; a.play();
    };
    const finished = (list: Animation[]) => Promise.all(list.map((a) => a.finished.catch(() => undefined)));
    const placeMirror = () => {
      const r = bar.getBoundingClientRect();
      Object.assign(mirror.style, { left: `${r.left}px`, width: `${r.width}px`, bottom: `${Math.max(12, innerHeight - r.bottom)}px` });
    };
    const lock = (on: boolean) => html.classList.toggle("smenu-locked", on);
    const open = async () => {
      if (state === "open" || state === "opening") return;
      if (state === "closing") { state = "opening"; anims.forEach((a) => turn(a, 1)); }
      else {
        state = "opening";
        setHidden(false);
        placeMirror();
        lock(true);
        menu.showModal();
        closeBtn.focus({ preventScroll: true });
        anims = build();
      }
      more.setAttribute("aria-expanded", "true");
      const mine = anims; await finished(mine);
      if (anims === mine && state === "opening") state = "open";
    };
    let settle: Promise<void> = Promise.resolve();
    const close = ({ returnFocus = true } = {}) => {
      if (state === "closed" || state === "closing") return settle;
      state = "closing";
      more.setAttribute("aria-expanded", "false");
      anims.forEach((a) => turn(a, -1.4));
      const mine = anims;
      settle = finished(mine.filter((a) => !(a as Animation & { word?: boolean }).word)).then(() => {
        if (state !== "closing" || anims !== mine) return;      // turned round again: it is opening
        anims.forEach((a) => a.cancel()); anims = [];
        menu.close();
        lock(false);
        state = "closed";
        if (returnFocus) more.focus({ preventScroll: true });
      });
      return settle;
    };
    const onMore = () => (state === "open" || state === "opening" ? void close() : void open());
    const onClose = () => void close();
    const onCancel = (e: Event) => { e.preventDefault(); void close(); };     // Esc: animate out, never snap
    // keep Tab inside the menu (the page is inert; this also keeps focus off the browser's own bar)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const f = [...menu.querySelectorAll<HTMLElement>("a[href], button")];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    // a page or section link: close first, then go there (the router lands focus on its heading)
    const onMenuClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      void close({ returnFocus: false }).then(() => navigate(a.href));
    };
    // wider than a phone with the menu open: it has nothing to do there
    const onPhone = () => {
      measure();
      if (!phone.matches && menu.open) { anims.forEach((a) => a.cancel()); anims = []; menu.close(); lock(false); state = "closed"; more.setAttribute("aria-expanded", "false"); }
    };

    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", measure);
    phone.addEventListener("change", onPhone);
    bar.addEventListener("focusin", onFocusIn);
    bar.addEventListener("focusout", onFocusOut);
    document.addEventListener("focusin", onFocusChange);
    document.addEventListener("focusout", onFocusChange);
    vv?.addEventListener("resize", keyboard);
    more.addEventListener("click", onMore);
    closeBtn.addEventListener("click", onClose);
    menu.addEventListener("cancel", onCancel);
    menu.addEventListener("keydown", onKey);
    menu.addEventListener("click", onMenuClick);
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    measure();
    frame();

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", measure);
      phone.removeEventListener("change", onPhone);
      bar.removeEventListener("focusin", onFocusIn);
      bar.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("focusin", onFocusChange);
      document.removeEventListener("focusout", onFocusChange);
      vv?.removeEventListener("resize", keyboard);
      more.removeEventListener("click", onMore);
      closeBtn.removeEventListener("click", onClose);
      menu.removeEventListener("cancel", onCancel);
      menu.removeEventListener("keydown", onKey);
      menu.removeEventListener("click", onMenuClick);
      ro.disconnect();
      anims.forEach((a) => a.cancel());
      if (menu.open) menu.close();
      lock(false);
      html.classList.remove("sbar-on");
      html.style.removeProperty("--sbar-space");
    };
  }, []);

  const current = (id: string, also?: readonly string[]) => active === id || !!also?.includes(active);
  return (
    <>
      <nav ref={barRef} className="sbar" aria-label="Sections" data-element="section-dock" data-state="shown">
        <ul>
          {items.map(([id, label, also]) => (
            <li key={id}><a className="sbar-item" href={hrefFor(id)} aria-current={current(id, also) ? "location" : undefined}>{label}</a></li>
          ))}
          <li>
            <button ref={moreRef} type="button" className="sbar-item sbar-more" aria-haspopup="dialog" aria-expanded="false" aria-controls="smenu">
              <i aria-hidden="true" />More
            </button>
          </li>
        </ul>
      </nav>
      <dialog ref={menuRef} id="smenu" className="smenu" aria-label="All sections">
        <div className="smenu-dim" />
        <div className="smenu-panel">
          <nav className="smenu-content" aria-label="All sections">
            <ul className="smenu-list">
              {all.map(([id, label]) => (
                <li key={id}>
                  <a className="smenu-link" href={hrefFor(id)} aria-current={active === id ? "location" : undefined}>
                    <span className="smenu-line"><span className="smenu-word">{label}</span></span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="smenu-bar">
            <a className="smenu-top" href="/">Ignos</a>
            <button type="button" className="smenu-close"><i aria-hidden="true" />Close</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
