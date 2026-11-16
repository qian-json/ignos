// Written with AI assistance (Claude Code)
import { PROOF_LAYER_VERSION } from "@still-air/proof";
import { Suspense, useEffect, useState } from "react";
import { MotionProvider, PauseButton } from "./motion";
import { AskBar } from "./AskBar";
import { TESTS } from "./panels/Measure";
import { ReplayProvider } from "./replay";
import { StretchPill } from "./elements/StretchPill";
import { SectionDock, type DockItem } from "./elements/SectionDock";
import { RollLabel } from "./elements/RollLabel";
import { KeyShortcuts } from "./elements/KeyShortcuts";
import { ConsoleNote } from "./elements/ConsoleNote";
import { IdleGhost } from "./elements/IdleGhost";
import { Entrances } from "./elements/Entrances";
import { PAGE_VIEWS } from "./pages";
import { hrefFor, type PageId } from "./router/routes";
import { startRouter, useRoute } from "./router/router";
import { startScroll } from "./router/scroll";
import "./router/router.css";

/** The header's links: one per page. */
const NAV: readonly (readonly [PageId, string])[] = [
  ["habitats", "Habitats"],
  ["ask", "Ask"],
  ["research", "Research"],
  ["method", "Method"],
];

/** Every place worth a link: the pages, and the research page's sections (menu, footer, keys). */
const ALL: readonly (readonly [string, string])[] = [
  ["habitats", "Habitats"],
  ["ask", "Ask"],
  ["research", "Research"],
  ["measure", "Measure"],
  ["orbit", "In orbit"],
  ["moon", "Moon Gap"],
  ["model", "The flame model"],
  ["method", "Method"],
];

/** The phone's bottom bar: the main pages; the rest sit behind its "More". */
const DOCK: readonly DockItem[] = [["habitats", "Habitats"], ["ask", "Ask"], ["research", "Research", ["overview", "measure", "orbit", "moon"]], ["method", "Method"]];

const RESEARCH_SECTIONS = ["overview", "measure", "orbit", "moon"];

/** The page, or on the research page the section in view, for the phone bar and menu. */
function useActive(page: PageId, key: number) {
  const [section, setSection] = useState("");
  useEffect(() => {
    setSection("");
    if (page !== "research") return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setSection(e.target.id)), { rootMargin: "-40% 0px -55% 0px" });
    RESEARCH_SECTIONS.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [page, key]);
  return page === "research" && section && section !== "overview" ? section : page;
}

/** The bar is dark while it sits over the opening film or a page's dark head, light over everything else. */
const DARK = ".journey, [data-bar-tone=\"dark\"]";
function useOverHero(key: number) {
  const [over, setOver] = useState(() => !!document.querySelector(DARK));
  useEffect(() => {
    const els = [...document.querySelectorAll(DARK)];
    setOver(els.some((el) => { const r = el.getBoundingClientRect(); return r.top <= 56 && r.bottom > 56; }));
    if (!els.length) return;
    const under = new Set<Element>();
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => (e.isIntersecting ? under.add(e.target) : under.delete(e.target)));
      setOver(under.size > 0);
    }, { rootMargin: "-56px 0px -100% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);
  return over;
}

export function App() {
  const route = useRoute();
  const page = route.page.id;
  const active = useActive(page, route.key);
  const over = useOverHero(route.key);
  const View = PAGE_VIEWS[page];

  useEffect(() => {
    const stopRouter = startRouter();
    const stopScroll = startScroll();
    return () => { stopRouter(); stopScroll(); };
  }, []);

  return (
    <MotionProvider>
      <ReplayProvider first={TESTS[0]}>
        <StretchPill />
        <ConsoleNote />
        <a className="skip" href="#top">Skip to content</a>
        <header className="top" data-tone={over ? "dark" : "light"}>
          <div className="top-inner">
            <a className="brand" href="/" aria-label="Ignos, home" aria-current={page === "home" ? "page" : undefined}>
              <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><rect x="11" y="13.5" width="17" height="5" rx="1" fill="currentColor" opacity="0.9" /><rect x="3" y="11" width="9" height="10" rx="5" fill="var(--flame-glow)" /><rect x="11" y="9" width="1.6" height="14" fill="var(--accent)" /></svg>
              Ignos
            </a>
            <nav className="nav" aria-label="Main" data-element="nav-roll">
              {NAV.map(([id, label]) => <a key={id} href={hrefFor(id)} aria-current={page === id ? "page" : undefined}><RollLabel text={label} /></a>)}
            </nav>
            <AskBar tone={over ? "dark" : "light"} />
            <PauseButton tone={over ? "dark" : "light"} />
          </div>
        </header>
        <SectionDock items={DOCK} all={ALL} active={active} />
        <main id="top" data-page={page}>
          <Suspense fallback={<div className="page-loading" aria-busy="true" />}><View key={route.key} /></Suspense>
        </main>
        <IdleGhost />
        <footer className="foot">
          <div className="foot-inner">
            <div className="foot-lead">
              <p className="foot-name">Ignos</p>
              <p>An entry to the NASA Space Apps Challenge 2026, “Flame in Freefall”.</p>
              <a className="btn ghost" href="#top">Back to the top</a>
            </div>
            <nav className="foot-col" aria-labelledby="foot-pages">
              <h2 id="foot-pages">Pages</h2>
              <ul>
                <li><a href="/">Home</a></li>
                {ALL.map(([id, label]) => <li key={id}><a href={hrefFor(id)}>{label}</a></li>)}
              </ul>
            </nav>
            <div className="foot-col">
              <h2>Data</h2>
              <ul>
                <li><a href="https://doi.org/10.60555/4qc4-de67">NASA PSI, BASS-II photos (CC0)</a></li>
                <li><a href="https://doi.org/10.1038/s41598-017-18398-4">Link et al. 2018, Table S1</a></li>
                <li><a href="https://ntrs.nasa.gov/citations/20250002114">ICES-2025-392, lunar limits</a></li>
              </ul>
            </div>
            <div className="foot-col">
              <h2>How it's made</h2>
              <ul>
                <li>Every number links to its file, row and column</li>
                <li>Proof layer v{PROOF_LAYER_VERSION}</li>
                <li>Written with AI assistance (Claude Code)</li>
                <li>No NASA endorsement implied</li>
                <li><KeyShortcuts sections={ALL} /></li>
              </ul>
            </div>
          </div>
        </footer>
        {/* each page's things enter as they scroll in, so it is mounted again with every page */}
        <Entrances key={route.key} />
      </ReplayProvider>
    </MotionProvider>
  );
}
