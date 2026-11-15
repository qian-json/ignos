// Written with AI assistance (Claude Code)
// Buttons that lean toward the pointer. Mounted once: it marks <html data-skins>, so every .btn and
// .chip on the page (now or later) draws its fill on a separate skin layer, and one delegated
// pointermove stretches the skin of the button under a fine pointer by up to 7 % toward the cursor
// (a hair thinner as it does). Every press fades a scrim in and out. Touch and reduced motion: the
// press scrim only, no stretch.
import { useEffect } from "react";
import "./stretch-pill.css";

const SEL = ".btn, .chip";
const MAX = 0.07;

export function StretchPill() {
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.skins = "";
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const rm = matchMedia("(prefers-reduced-motion: reduce)");
    let cur: HTMLElement | null = null;
    const reset = (el: HTMLElement | null) => { el?.style.removeProperty("--sk-x"); el?.style.removeProperty("--sk-y"); };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !fine.matches || rm.matches) return;
      const el = (e.target as Element | null)?.closest?.<HTMLElement>(SEL) ?? null;
      if (el !== cur) { reset(cur); cur = el; }
      if (!el || (el as HTMLButtonElement).disabled) return;
      const r = el.getBoundingClientRect();
      const u = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width / 2)));
      el.style.setProperty("--sk-o", u > 0 ? "0%" : "100%");
      el.style.setProperty("--sk-x", String(1 + MAX * Math.abs(u)));
      el.style.setProperty("--sk-y", String(1 - 0.03 * Math.abs(u)));
    };
    const leave = (e: PointerEvent) => { if (cur && !cur.contains(e.relatedTarget as Node | null)) { reset(cur); cur = null; } };
    const off = () => { reset(cur); cur = null; };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerout", leave, { passive: true });
    rm.addEventListener("change", off);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerout", leave);
      rm.removeEventListener("change", off);
      off();
      delete html.dataset.skins;
    };
  }, []);
  return <span hidden data-element="stretch-pill" />;
}
