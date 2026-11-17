// Written with AI assistance (Claude Code)
// A small router of our own on the History API. Plain <a href> links work everywhere: one click
// listener sends same-site page links (and #section links whose section lives on another page)
// through navigate(), and lets everything else (new tab, modifier keys, files, /api, other sites)
// behave as a normal link. A page change puts the sheet over the old page, swaps the page, sets the
// tab title, lands on the top or the anchor, moves focus to the page's heading and tells screen
// readers which page opened, then lifts the sheet. Back and Forward restore where you were.
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { ASK_EVENT, type AskRequest } from "../AskBar";
import { cover, curtainOn, uncover } from "./curtain";
import { SECTION_PAGE, hrefFor, page, pageForPath, safeDecode, upgradeLegacy, type PageDef, type PageId } from "./routes";
import { hasPendingAsk, holdAsk, takePendingAsk } from "./pendingAsk";
import { elementY, holdScroll, scrollToElement, scrollToY } from "./scroll";

export interface Route {
  page: PageDef;
  /** The anchor without '#', or "". */
  hash: string;
  /** Changes on every page change (a new page mounts under a new key). */
  key: number;
}

type Entry = { y?: number; idx?: number };

let route: Route = { page: pageForPath(location.pathname), hash: safeDecode(location.hash.slice(1)), key: 0 };
const subs = new Set<() => void>();
let ticket = 0;            // the newest navigation; an older one stops at its next step
let index = 0;             // this entry's place in history, to tell Back from Forward

const emit = () => subs.forEach((fn) => fn());
const set = (next: Route) => { route = next; flushSync(emit); };

export function useRoute(): Route {
  return useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn); }, () => route);
}
export const currentPage = (): PageId => route.page.id;

// ---------- landing: scroll, focus, title, announcement ----------

let announcer: HTMLElement | null = null;
function announce(text: string) {
  if (!announcer?.isConnected) {
    announcer = document.createElement("div");
    announcer.className = "sr-only";
    announcer.setAttribute("aria-live", "polite");
    announcer.setAttribute("aria-atomic", "true");
    announcer.dataset.element = "page-announcer";
    document.body.append(announcer);
  }
  announcer.textContent = "";
  // a separate task, so the same title twice is still read
  setTimeout(() => { if (announcer) announcer.textContent = text; }, 60);
}

const seen = (h: HTMLElement) => h.getClientRects().length > 0 && !h.closest(".sr-only, .sr, [hidden]");
/**
 * The heading that names a target: the element itself, else its first heading a sighted reader can
 * see (so the focus ring lands where the eye is), else the first heading at all.
 */
function headingOf(el: Element | null | undefined): HTMLElement | null {
  if (!el) return null;
  if (el.matches("h1, h2, h3")) return el as HTMLElement;
  const all = [...el.querySelectorAll<HTMLElement>("h1, h2, h3")];
  return all.find(seen) ?? all[0] ?? null;
}
function focusQuietly(el: HTMLElement | null) {
  if (!el) return;
  if (!el.hasAttribute("tabindex") && !el.matches("a[href], button, input, select, textarea")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

const target = (hash: string) => (hash && hash !== "top" ? document.getElementById(hash) : null);

/**
 * Keep an anchor at the top while the page below it is still settling (charts draw late, toggles
 * measure themselves), until the reader scrolls on their own.
 */
function holdAnchor(el: Element) {
  const main = document.querySelector("main");
  if (!main || typeof ResizeObserver === "undefined") return;
  let stop = () => {};
  const ro = new ResizeObserver(() => { if (Math.abs(elementY(el) - scrollY) > 2) void scrollToY(elementY(el), { instant: true }); });
  const quit = () => stop();
  stop = () => { ro.disconnect(); ["wheel", "touchstart", "keydown", "pointerdown"].forEach((t) => removeEventListener(t, quit)); };
  ro.observe(main);
  ["wheel", "touchstart", "keydown", "pointerdown"].forEach((t) => addEventListener(t, quit, { passive: true, once: true }));
  setTimeout(stop, 1600);
}

/** The element with this id once it exists, or null after `ms`. */
function appears(id: string, ms: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const now = document.getElementById(id);
    if (now) return resolve(now);
    const mo = new MutationObserver(() => {
      const el = document.getElementById(id);
      if (el) { mo.disconnect(); clearTimeout(t); resolve(el); }
    });
    const t = setTimeout(() => { mo.disconnect(); resolve(null); }, ms);
    mo.observe(document.body, { childList: true, subtree: true });
  });
}

/** After a page has rendered: where to stand, where focus goes, what the tab and screen reader say. */
function land(r: Route, y: number | undefined, moveFocus: boolean) {
  document.title = r.page.title;
  const el = target(r.hash);
  if (y !== undefined) void scrollToY(y, { instant: true });
  else if (el) { void scrollToElement(el, { instant: true }); holdAnchor(el); }
  else {
    void scrollToY(0, { instant: true });
    // A section that mounts a moment after the page (a lazy panel, e.g. /research#moon): wait for it briefly,
    // then go there, unless the visitor has already moved on to another page or scrolled this one.
    // Not if the reader has already started scrolling this page: a late jump would yank them back.
    const y0 = scrollY;
    if (r.hash && r.hash !== "top") void appears(r.hash, 2000).then((late) => { if (late && route.key === r.key && Math.abs(scrollY - y0) <= 4) { void scrollToElement(late, { instant: true }); holdAnchor(late); } });
  }
  // scroll-driven pieces measure themselves on the new page at once
  dispatchEvent(new Event("scroll"));
  if (moveFocus) {
    const main = document.querySelector("main");
    focusQuietly(headingOf(el) || headingOf(main) || main);
    announce(r.page.id === "home" ? "Ignos, home page" : `${r.page.label} page`);
  }
}

// ---------- navigation ----------

function remember() {
  const st: Entry = { ...(history.state as Entry | null), y: scrollY, idx: index };
  history.replaceState(st, "");
}

async function change(next: Route, y: number | undefined, animate: boolean) {
  const mine = ++ticket;
  const sheet = animate && curtainOn();
  holdScroll(true);
  if (sheet) await cover();
  if (mine !== ticket) return;
  set(next);
  land(next, y, true);
  holdScroll(false);
  if (sheet) {
    // one frame for the new page to paint behind the sheet
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    if (mine !== ticket) return;
    await uncover();
  }
  flushAsk();
}

/** Go to a same-site URL. Returns once the new page is in place. */
export async function navigate(href: string, { replace = false } = {}): Promise<void> {
  let url = new URL(href, location.href);
  if (url.origin !== location.origin) { location.assign(url.href); return; }
  url = upgradeLegacy(url) ?? url;
  // a bare #section from a page it isn't on: go to the page it lives on
  const hash = safeDecode(url.hash.slice(1));
  let next = pageForPath(url.pathname);
  if (hash && next.id === route.page.id && !document.getElementById(hash) && SECTION_PAGE[hash] && SECTION_PAGE[hash] !== next.id) {
    url = new URL(hrefFor(hash), location.origin);
    next = pageForPath(url.pathname);
  }
  const newHash = safeDecode(url.hash.slice(1));

  if (next.id === route.page.id) {
    // same page: glide to the anchor (or the top)
    if (url.href !== location.href) {
      if (replace) history.replaceState({ idx: index }, "", url);
      else { remember(); history.pushState({ idx: ++index }, "", url); }
    }
    route = { ...route, hash: newHash };
    const el = target(newHash);
    // focus first (without scrolling), so a keyboard reader's next Tab starts there even mid-glide
    focusQuietly(headingOf(el) ?? (el as HTMLElement | null) ?? headingOf(document.querySelector("main")));
    await (el ? scrollToElement(el) : scrollToY(0));
    flushAsk();
    return;
  }

  remember();
  if (replace) history.replaceState({ idx: index }, "", url);
  else history.pushState({ idx: ++index }, "", url);
  await change({ page: next, hash: newHash, key: route.key + 1 }, undefined, true);
}

/** Back and Forward: the page they lead to, where the reader stood on it. */
function onPop(e: PopStateEvent) {
  const st = (e.state ?? {}) as Entry;
  index = st.idx ?? index;
  const url = new URL(location.href);
  const legacy = upgradeLegacy(url);
  if (legacy) { history.replaceState({ idx: index }, "", legacy); void change({ page: pageForPath(legacy.pathname), hash: safeDecode(legacy.hash.slice(1)), key: route.key + 1 }, undefined, false); return; }
  const next = pageForPath(url.pathname);
  const hash = safeDecode(url.hash.slice(1));
  if (next.id === route.page.id) {
    route = { ...route, hash };
    const el = target(hash);
    if (st.y !== undefined) void scrollToY(st.y);
    else if (el) void scrollToElement(el);
    else void scrollToY(0);
    return;
  }
  // a back swipe the browser already animated needs no sheet of ours
  const swiped = (e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true;
  void change({ page: next, hash, key: route.key + 1 }, st.y, !swiped);
}

/** Should this click be ours? Only plain same-site links to a page of this site. */
function ours(e: MouseEvent): HTMLAnchorElement | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
  if (!a || a.hasAttribute("download") || (a.target && a.target !== "_self") || a.dataset.router === "off") return null;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return null;
  if (pageForPath(url.pathname).id === "missing") return null;   // /api, files, anything that isn't a page
  return a;
}
function onClick(e: MouseEvent) {
  const a = ours(e);
  if (!a) return;
  e.preventDefault();
  void navigate(a.href);
}

/** A typed or edited #anchor (the address bar), or a link we let through. */
function onHash() {
  const url = new URL(location.href);
  const hash = safeDecode(url.hash.slice(1));
  const home = SECTION_PAGE[hash];
  if (hash && !document.getElementById(hash) && home && home !== route.page.id) void navigate(url.href, { replace: true });
}

// ---------- Ask from any page ----------

/** A question asked away from the Ask page: go there, then hand it over once the page listens. */
function onAsk(e: Event) {
  if (route.page.id === "ask") return;
  holdAsk((e as CustomEvent<AskRequest>).detail);
  void navigate(page("ask").path);
}
/** The Ask panel takes a waiting question when it mounts (Ask.tsx). */
export { takePendingAsk };
function flushAsk() {
  // The Ask page is lazy: until its panel is on the page, the question waits for the panel to take it
  // on mount, so a cold load or a slow network does not lose it.
  if (!hasPendingAsk() || route.page.id !== "ask" || !document.getElementById("ask")) return;
  setTimeout(() => { const req = takePendingAsk(); if (req) dispatchEvent(new CustomEvent<AskRequest>(ASK_EVENT, { detail: req })); }, 0);
}

// ---------- start ----------

// Before the first render: an old one-page link (/#measure, /?ask=...) is rewritten for the pages,
// so the right page renders straight away.
{
  const legacy = upgradeLegacy(new URL(location.href));
  if (legacy) {
    history.replaceState(history.state, "", legacy);
    route = { page: pageForPath(legacy.pathname), hash: safeDecode(legacy.hash.slice(1)), key: 0 };
  }
}

/** Wire up the router once. Returns a function that removes every listener. */
export function startRouter(): () => void {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const st = (history.state ?? {}) as Entry;
  index = st.idx ?? 0;
  history.replaceState({ ...st, idx: index }, "");
  document.title = route.page.title;
  // a deep link (/research#moon) or a reload: land where the address or the history entry says
  const first = requestAnimationFrame(() => {
    const el = target(route.hash);
    if (st.y !== undefined) void scrollToY(st.y, { instant: true });
    else if (el) { void scrollToElement(el, { instant: true }); holdAnchor(el); }
  });

  addEventListener("popstate", onPop);
  addEventListener("hashchange", onHash);
  addEventListener(ASK_EVENT, onAsk);
  document.addEventListener("click", onClick);
  const save = () => remember();
  addEventListener("pagehide", save);
  return () => {
    cancelAnimationFrame(first);
    removeEventListener("popstate", onPop);
    removeEventListener("hashchange", onHash);
    removeEventListener(ASK_EVENT, onAsk);
    document.removeEventListener("click", onClick);
    removeEventListener("pagehide", save);
  };
}

