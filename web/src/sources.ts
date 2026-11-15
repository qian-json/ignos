// Written with AI assistance (Claude Code)
// Turns the citations an Ask answer carries into links a researcher can open: the NASA PSI archive
// entry, the paper, or the panel on this page that holds the rows. No science values live here.
import type { Citation } from "@still-air/proof";
import { investigations } from "./data";

export interface SourceLink { label: string; href: string; external: boolean }

const BASS2 = investigations.investigations.find((i) => i.accession === "PSI-25");

/** Papers we can link. Ids we hold no verified link for are shown as text only. */
const PAPERS: Record<string, { label: string; href?: string }> = {
  link2018: { label: "Link et al. 2018, Sci. Rep. 8:120", href: "https://doi.org/10.1038/s41598-017-18398-4" },
  link2018_si: { label: "Link et al. 2018, supplement (Table S1)", href: "https://doi.org/10.1038/s41598-017-18398-4" },
  ices2025: { label: "ICES-2025-392 (NASA NTRS)", href: "https://ntrs.nasa.gov/citations/20250002114" },
  fm2_2026: { label: "Ferkul et al., LPSC 2026, FM2 (NASA NTRS)", href: "https://ntrs.nasa.gov/citations/20260001966" },
  bass2_results: { label: "BASS-II results" },
  ruff: { label: "Ruff, NASA Glenn, FISO 2017" },
  nasa_std_3001: { label: "NASA-STD-3001" },
  jaxa_flare: { label: "JAXA FLARE" },
};

function rowLink(id: string): SourceLink | null {
  const [dataset, key = ""] = id.split(":");
  switch (dataset) {
    case "investigations": {
      const inv = investigations.investigations.find((i) => i.accession === key);
      if (inv) return { label: `NASA PSI archive: ${inv.acronym ?? inv.full_name} (${inv.accession})`, href: inv.psi_url, external: true };
      return { label: "Investigations table", href: "#investigations", external: false };
    }
    case "spread_rates":
      return BASS2 ? { label: `NASA PSI archive: BASS-II photos (${BASS2.accession})`, href: BASS2.psi_url, external: true } : null;
    case "table_s1":
      return { label: PAPERS.link2018_si.label, href: PAPERS.link2018_si.href!, external: true };
    case "moongap":
      return { label: PAPERS.ices2025.label, href: PAPERS.ices2025.href!, external: true };
    case "envelope":
      return { label: PAPERS.fm2_2026.label, href: PAPERS.fm2_2026.href!, external: true };
    case "method":
    case "control":
      return { label: "How we measured (Method)", href: "#method", external: false };
    default:
      return null;
  }
}

/** One link per destination, in the order the answer cites them. Paper pages are added to the label. */
export function sourceLinks(citations: Citation[]): { links: SourceLink[]; unlinked: string[] } {
  const links: SourceLink[] = [];
  const unlinked: string[] = [];
  const seen = new Map<string, SourceLink>();
  const pages = new Map<string, Set<number>>();
  for (const c of citations) {
    let link: SourceLink | null;
    if (c.kind === "paper") {
      const p = PAPERS[c.id];
      if (!p?.href) { const t = p?.label ?? c.id; if (!unlinked.includes(t)) unlinked.push(t); continue; }
      link = { label: p.label, href: p.href, external: true };
      if (c.page) pages.set(p.href, (pages.get(p.href) ?? new Set()).add(c.page));
    } else link = rowLink(c.id);
    if (link && !seen.has(link.href)) { seen.set(link.href, link); links.push(link); }
  }
  for (const l of links) {
    const ps = pages.get(l.href);
    if (ps?.size) l.label += `, p. ${[...ps].sort((a, b) => a - b).join(", ")}`;
  }
  return { links, unlinked };
}
