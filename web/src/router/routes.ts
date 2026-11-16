// Written with AI assistance (Claude Code)
// The site's pages and where every section lives. Old one-page links (/#measure, /#habitats) are
// read through SECTION_PAGE, so a link shared before the split still lands on the right page.

export type PageId = "home" | "story" | "habitats" | "ask" | "research" | "model" | "method" | "missing";

export interface PageDef {
  id: PageId;
  path: string;
  /** Short name for links and the screen-reader announcement. */
  label: string;
  /** The browser tab's title. */
  title: string;
}

const SITE = "Ignos";
const HOME_TITLE = "Ignos · flame spread in orbit, and what changes on the Moon";

export const PAGES: readonly PageDef[] = [
  { id: "home", path: "/", label: "Home", title: HOME_TITLE },
  { id: "story", path: "/story", label: "Story", title: `${SITE} · Story` },
  { id: "habitats", path: "/habitats", label: "Habitats", title: `${SITE} · Habitats` },
  { id: "ask", path: "/ask", label: "Ask", title: `${SITE} · Ask` },
  { id: "research", path: "/research", label: "Research", title: `${SITE} · Research` },
  { id: "model", path: "/model", label: "The flame model", title: `${SITE} · The flame model` },
  { id: "method", path: "/method", label: "Method", title: `${SITE} · Method` },
];

export const MISSING: PageDef = { id: "missing", path: "", label: "Not found", title: `${SITE} · Not found` };

const BY_PATH = new Map(PAGES.map((p) => [p.path, p]));
export const page = (id: PageId): PageDef => PAGES.find((p) => p.id === id) ?? MISSING;

/** Every section id that has a home, by page. Ids that name a page itself link to the page's top. */
export const SECTION_PAGE: Readonly<Record<string, PageId>> = {
  story: "story",
  habitats: "habitats", compare: "habitats",
  ask: "ask",
  research: "research", overview: "research", measure: "research", orbit: "research", moon: "research",
  model: "model",
  method: "method",
  "ch-open": "home", "ch-fans": "home", "ch-still": "home", "ch-moon": "home", "ch-end": "home",
};
const PAGE_ROOTS = new Set(["story", "habitats", "ask", "research", "overview", "model", "method"]);

/** decodeURIComponent that never throws: a malformed escape (a "/#100%" link) is kept as typed. */
export const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** The page a pathname shows ("/research/" and "/Research" too). */
export function pageForPath(pathname: string): PageDef {
  const p = pathname.replace(/\/+$/, "").toLowerCase() || "/";
  if (p === "/index.html") return page("home");
  return BY_PATH.get(p) ?? MISSING;
}

/** The link for a section id: its page, plus the anchor when the section is not the page itself. */
export function hrefFor(id: string): string {
  const home = SECTION_PAGE[id];
  if (!home) return `#${id}`;
  const path = page(home).path;
  return PAGE_ROOTS.has(id) ? path : `${path}#${id}`;
}

/**
 * A URL from the one-page site, rewritten for the pages: "/#measure" becomes "/research#measure",
 * "/?ask=..." becomes "/ask?ask=...". Returns null when the URL needs no change.
 */
export function upgradeLegacy(url: URL): URL | null {
  if (pageForPath(url.pathname).id !== "home") return null;
  const id = safeDecode(url.hash.slice(1));
  const home = id ? SECTION_PAGE[id] : undefined;
  if (home && home !== "home") {
    const next = new URL(hrefFor(id), url.origin);
    next.search = url.search;
    return next;
  }
  if (url.searchParams.has("ask")) {
    const next = new URL(url.href);
    next.pathname = page("ask").path;
    return next;
  }
  return null;
}
