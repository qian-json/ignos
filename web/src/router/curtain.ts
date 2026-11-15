// Written with AI assistance (Claude Code)
// The change between pages: a night-blue sheet rises from the bottom edge over the old page (200 ms),
// the new page is put in place behind it, and the sheet carries on up and off (230 ms), so the swap
// itself is never seen. A thin line of flame blue leads the sheet. Reduced motion, the Pause switch
// and a browser that already animated a back swipe: no sheet, the page simply changes.
import { motionPaused, prefersReduced } from "../elements/motionState";

const IN_MS = 200;
const OUT_MS = 230;
const EASE_IN = "cubic-bezier(.65,0,.35,1)";
const EASE_OUT = "cubic-bezier(.33,1,.68,1)";

let sheet: HTMLDivElement | null = null;
let anim: Animation | null = null;

export const curtainOn = () => !prefersReduced() && !motionPaused() && typeof Element.prototype.animate === "function";

function ensure(): HTMLDivElement {
  if (sheet?.isConnected) return sheet;
  sheet = document.createElement("div");
  sheet.className = "pg-sheet";
  sheet.setAttribute("aria-hidden", "true");
  sheet.dataset.element = "page-sheet";
  document.body.append(sheet);
  return sheet;
}

const run = (frames: Keyframe[], ms: number, easing: string): Promise<void> => {
  const el = ensure();
  anim?.cancel();
  el.dataset.state = "on";
  anim = el.animate(frames, { duration: ms, easing, fill: "forwards" });
  return anim.finished.then(() => undefined, () => undefined);
};

/** The sheet rises over the page. Resolves once it covers the screen. */
export function cover(): Promise<void> {
  if (!curtainOn()) return Promise.resolve();
  return run([{ transform: "translateY(100%)" }, { transform: "none" }], IN_MS, EASE_IN);
}

/** The sheet leaves through the top edge, uncovering the new page. */
export async function uncover(): Promise<void> {
  if (!sheet || sheet.dataset.state !== "on") return;
  if (!curtainOn()) { done(); return; }
  await run([{ transform: "none" }, { transform: "translateY(-100%)" }], OUT_MS, EASE_OUT);
  done();
}

function done() {
  anim?.cancel(); anim = null;
  if (sheet) delete sheet.dataset.state;
}
