// Written with AI assistance (Claude Code)
// NASA's solid-fuel flame investigations that lead to a Moon test, on one line placed to scale by the
// years they ran in flight. Every name and year is read from the records: a name is what the grouped
// records share (the ACME records share "ACME"), a year is the earliest and latest year written in each
// record's operations field. FM2 comes from the fact index and has no flight date in our data, so it
// sits after the dated line with no year.
import type { CSSProperties } from "react";
import { FACTS, INVESTIGATIONS_FILE, cell, investigations, type Investigation } from "../data";
import { Num } from "../Num";
import "./provenance-line.css";

const ALL = investigations.investigations;
/** Which records make each stop. Selection only: the shown name comes from the records themselves. */
const STOPS: ((acronym: string) => boolean)[] = [
  (a) => a === "BASS",
  (a) => a === "BASS-II",
  (a) => /^ACME\b/.test(a),
  (a) => /^SAFFIRE\b/.test(a),
];
const YEAR = /(?<!\d)(?:19|20)\d{2}(?!\d)/g;
const yearsOf = (iv: Investigation) => [...((iv as unknown as { years?: { operations?: string } }).years?.operations ?? "").matchAll(YEAR)].map((m) => Number(m[0]));

/** The words every record in a group starts with ("SAFFIRE-I", "SAFFIRE-II" → "SAFFIRE"). */
function shared(names: string[]): string {
  const split = names.map((n) => n.split(/[\s-]+/));
  if (split.length === 1) return names[0];
  const out: string[] = [];
  for (let i = 0; i < split[0].length && split.every((s) => s[i] === split[0][i]); i++) out.push(split[0][i]);
  return out.join(" ") || names[0];
}

interface Stop { name: string; from: { year: number; i: number }; to: { year: number; i: number } }
const stops: Stop[] = STOPS.flatMap((pick) => {
  const recs = ALL.map((iv, i) => ({ iv, i })).filter(({ iv }) => iv.acronym && pick(iv.acronym));
  const dated = recs.flatMap(({ iv, i }) => yearsOf(iv).map((year) => ({ year, i })));
  if (!dated.length) return [];
  const from = dated.reduce((a, b) => (b.year < a.year ? b : a));
  const to = dated.reduce((a, b) => (b.year > a.year ? b : a));
  return [{ name: shared(recs.map(({ iv }) => iv.acronym!)), from, to }];
}).sort((a, b) => a.from.year - b.from.year || a.to.year - b.to.year);

// the planned Moon test: its name is the fact index's dataset id for that paper ("fm2_…" → "FM2")
const PLANNED = FACTS.find((f) => f.id.startsWith("fm2_"))?.dataset?.split("_")[0]?.toUpperCase();

const MIN = Math.min(...stops.map((s) => s.from.year));
const MAX = Math.max(...stops.map((s) => s.to.year));
const DATED = PLANNED ? 0.8 : 1; // share of the line the dated years take; the rest leads to the undated stop
const at = (y: number) => (MAX > MIN ? ((y - MIN) / (MAX - MIN)) * DATED : 0);

const src = (i: number, which: "earliest" | "latest") => ({ ...cell(INVESTIGATIONS_FILE, 0, `investigations[${i}].years.operations`), derived: `${which} year written in this record's operations` });

export function ProvenanceLine() {
  if (!stops.length) return null;
  const n = stops.length + (PLANNED ? 1 : 0);
  const edge = (k: number) => (k === 0 ? "start" : k === n - 1 ? "end" : "mid");
  return (
    <figure className="pl" data-element="provenance-line" aria-labelledby="pl-cap">
      <ol className="pl-line" style={{ "--dated": DATED } as CSSProperties}>
        {stops.map((s, k) => (
          <li key={s.name} data-side={k % 2 ? "down" : "up"} data-edge={edge(k)} style={{ "--at": at(s.from.year), "--len": at(s.to.year) - at(s.from.year) } as CSSProperties}>
            <span className="pl-mark" aria-hidden="true" />
            <span className="pl-label">
              <strong>{s.name}</strong>
              <span className="pl-years">
                <Num source={src(s.from.i, "earliest")}>{String(s.from.year)}</Num>
                {s.to.year !== s.from.year && <>–<Num source={src(s.to.i, "latest")}>{String(s.to.year)}</Num></>}
              </span>
            </span>
          </li>
        ))}
        {PLANNED && (
          <li data-side={stops.length % 2 ? "down" : "up"} data-edge="end" data-planned="" style={{ "--at": 1, "--len": 0 } as CSSProperties}>
            <span className="pl-mark" aria-hidden="true" />
            <span className="pl-label"><strong>{PLANNED}</strong><span className="pl-years">planned</span></span>
          </li>
        )}
      </ol>
      <figcaption id="pl-cap" className="caption">
        Flight years from NASA's PSI records, to scale; a bar runs from a group's first flight to its last.
        {PLANNED && <> {PLANNED}, the planned Moon test, has no flight date in our data.</>}
      </figcaption>
    </figure>
  );
}
