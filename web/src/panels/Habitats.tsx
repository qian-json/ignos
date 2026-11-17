// Written with AI assistance (Claude Code)
// Pick a habitat: NASA's combustion investigations ranked for where a crew will live, compared side
// by side, each one opened to its NASA record and asked about, and the gaps for that habitat counted
// from the records themselves. Every field and score comes from data/reference/psi_investigations.json
// (the scores are the team's judgment, and the panel says so); habitat conditions are shown only where
// a data file carries them with a source. The first read is each row's name, score and a short reason;
// the rest of a row (its full reasoning, finding, record and fit details) shows when the row is opened.
import { useMemo, useState, type ReactNode } from "react";
import { scrollToElement } from "../router/scroll";
import { askIgnos } from "../AskBar";
import { More } from "../ui/More";
import { Num } from "../Num";
import { useRowSpotlight } from "../elements/RowSpotlight";
import { ProvenanceLine } from "../elements/ProvenanceLine";
import { LivePsi } from "../elements/LivePsi";
import { AtmosphereCard } from "../elements/AtmosphereCard";
import { atmospheres } from "../data";

/** The challenge page's own sentences on partial gravity (data/reference/habitat_atmospheres.json). */
const PARTIAL_QUOTES = (atmospheres.context_quotes ?? []).filter((q) => q.id === "bound" || q.id === "efield" || q.id === "future");
/** The challenge page's sentence that PSI holds no partial-gravity combustion data. */
const NO_PARTIAL_G = atmospheres.context_quotes?.find((q) => q.id === "no_partial_g")?.text;
import { CONDITIONS_FILE, FACTS, INVESTIGATIONS_FILE, MOONGAP_FILE, cell, conditions, investigations, moongap, type Conditions as Cond, type Investigation } from "../data";

type Inv = Investigation;
const ALL = investigations.investigations;
const N = ALL.length;

const SETTING_NAMES: Record<string, string> = {
  iss: "ISS",
  spacecraft_cabin: "Spacecraft cabin",
  lunar_base: "Moon base",
  mars_base: "Mars base",
  pressurized_rover: "Pressurized rover",
};
// the order the buttons show, keeping only settings the data actually scores
/** Each habitat as it reads inside a sentence ("for a Moon base"). */
const IN_SENTENCE: Record<string, string> = { iss: "the ISS", spacecraft_cabin: "a spacecraft cabin", lunar_base: "a Moon base", mars_base: "a Mars base", pressurized_rover: "a pressurized rover" };
const SETTINGS = ["iss", "spacecraft_cabin", "lunar_base", "mars_base", "pressurized_rover"].filter((s) => ALL[0]?.relevance[s]);
// the top of the rubric is the best score present in the data, not a typed constant
const TOP = Math.max(...ALL.flatMap((iv) => SETTINGS.map((s) => iv.relevance[s]?.score ?? 0)));
const total = (iv: Inv) => SETTINGS.reduce((a, s) => a + (iv.relevance[s]?.score ?? 0), 0);
const idx = (iv: Inv) => ALL.indexOf(iv);
const scoreSrc = (iv: Inv, s: string) => cell(INVESTIGATIONS_FILE, 0, `investigations[${idx(iv)}].relevance.${s}.score`);
const accNum = (iv: Inv) => Number(iv.accession.replace(/\D/g, ""));
const flew = (iv: Inv) => /flight/i.test(iv.investigation_type);
const name = (iv: Inv) => iv.acronym || iv.full_name;
// read from each record's gravity field: did it burn anything at lunar or Martian gravity?
const PARTIAL = /lunar|moon|mars|martian|partial|1\/6|1\/3/i;
const partialG = ALL.filter((iv) => PARTIAL.test(iv.gravity));

/** What a crew in each habitat lives in, in words; numbers only where a data file carries them. */
const LIVES_IN: Record<string, string> = {
  iss: "Microgravity: no buoyant flow, so cabin ventilation sets the airflow around a fire.",
  spacecraft_cabin: "Microgravity in a small sealed cabin: like the station, with less volume and fewer exits.",
  lunar_base: "Partial gravity, so buoyant flow returns, and a planned atmosphere with a higher O2 fraction at lower total pressure than Earth's.",
  mars_base: "Partial gravity, so buoyant flow returns, in a sealed habitat far from help.",
  pressurized_rover: "A small cabin driving on the Moon or Mars: partial gravity in a confined volume.",
};
const LUNAR_G = FACTS.find((f) => f.id === "fm2_2026-lunar-g");
const MOON_BASE = moongap.reference_lines?.moon_base_o2;
// ICES-2025-392's lunar-gravity tests are NASA's partial-gravity flammability data, but they aren't in PSI
const PARTIAL_HABITATS = new Set(["lunar_base", "mars_base", "pressurized_rover"]);
// our own measurements come from this investigation's photos
const MEASURED = "PSI-25";

// ---- "describe your habitat": the visitor's own conditions, matched against each record's numbers
type Grav = "orbit" | "partial" | "earth";
const GRAV_NAMES: Record<Grav, string> = { orbit: "Orbit (no gravity)", partial: "Moon or Mars", earth: "Earth" };
/** The same, inside a sentence: "ran in orbit", "ran at Moon or Mars gravity". */
const GRAV_AT: Record<Grav, string> = { orbit: "in orbit", partial: "at Moon or Mars gravity", earth: "at Earth gravity" };
/** The same, as short as a chip allows. */
const GRAV_CHIP: Record<Grav, string> = { orbit: "in orbit", partial: "in Moon/Mars gravity", earth: "on Earth" };
const PRESET_GRAV:Record<string, Grav> = { iss: "orbit", spacecraft_cabin: "orbit", lunar_base: "partial", mars_base: "partial", pressurized_rover: "partial" };
const COND = new Map(conditions.conditions.map((c, i) => [c.accession, { c, i }]));
/** Hardware groups present in the data, in first-seen order, with how many investigations each has. */
const HW_GROUPS: [string, string, number][] = [...conditions.conditions.reduce((m, c) => {
  if (c.hardware_group) m.set(c.hardware_group, [c.hardware_label ?? c.hardware_group, (m.get(c.hardware_group)?.[1] ?? 0) + 1]);
  return m;
}, new Map<string, [string, number]>())].map(([id, [label, n]]) => [id, label, n]);
const fmt = (v: number) => String(Math.round(v * 100) / 100);
/** "near": the record gives the level only as approximate ("~21%"), so a match is never claimed as an exact tested level. "at": the record lists the visitor's value as a tested level. "span": inside a reported span with no list, so the exact level is unconfirmed. "between": inside the span but between listed levels, so not tested. */
type Fit = "at" | "near" | "span" | "between" | "above" | "below" | "none";
/** How close a visitor's value must be to a listed level that the record gives as approximate ("~21%"): a matching tolerance, not a measured value. */
const APPROX_MATCH = 0.5;
function fitO2(c: Cond | undefined, v: number | null): Fit | null {
  if (v === null) return null;
  const r = c?.o2_pct;
  if (!r) return "none";
  if (v < r.min - (r.approx ? APPROX_MATCH : 0)) return "below";
  if (v > r.max + (r.approx ? APPROX_MATCH : 0)) return "above";
  const levels = r.values?.length ? r.values : r.max === r.min ? [r.min] : null;
  if (!levels) return "span";
  const tol = r.approx ? APPROX_MATCH : 1e-9;
  return levels.some((x) => Math.abs(x - v) <= tol) ? (r.approx ? "near" : "at") : "between";
}
const includes = (f: Fit | null) => f === "at" || f === "near" || f === "span";
/** A record whose gravity is a model or simulation, not a run: it never counts as having run there. */
const modelled = (c: Cond | undefined) => /model|simulat/i.test(c?.gravity_source?.reading ?? "");
function atG(c: Cond | undefined, g: Grav): boolean {
  if (!c || g === "partial") return false;   // no record ran at lunar or Martian gravity (gravity_g is 0 or 1 only)
  return c.gravity_g.includes(g === "orbit" ? 0 : 1);
}
function fitG(c: Cond | undefined, g: Grav): boolean {
  return atG(c, g) && !modelled(c) && (g !== "orbit" || c?.kind === "flight");
}
/** A record that covers this gravity only on the ground or on paper, named by its own reading ("model", "simulation", ...). */
const notRun = (c: Cond | undefined, g: Grav) => {
  const how = c?.gravity_source?.reading ?? "ground study";
  return g === "orbit" ? `ground study (${how}); no flight run for this investigation` : `${how}, not a run at Earth gravity`;
};
/** A row's reason in a few words: the first clause of the score's "why", cut to `max` words. */
const LINK_WORDS = new Set(["a", "an", "the", "and", "or", "but", "of", "to", "at", "for", "with", "in", "on", "by", "from", "as", "than", "that", "is", "are"]);
function brief(why: string, max = 8): string {
  const clause = why.split(/[;:,.](?:\s|$)|\s\(/)[0].trim();
  let w = clause.split(/\s+/).filter(Boolean);
  const cut = w.length > max;
  w = w.slice(0, max);
  if (cut) while (w.length > 1 && LINK_WORDS.has(w[w.length - 1].toLowerCase())) w.pop();
  return w.join(" ") + (cut ? "…" : "");
}
const num = (s: string) => { const v = Number(s); return s.trim() !== "" && Number.isFinite(v) ? v : null; };

/** One line under a row: how this record's own conditions compare with the visitor's, in short chips. */
function FitLine({ iv, o2, g }: { iv: Inv; o2: number | null; g: Grav }) {
  const hit = COND.get(iv.accession); const c = hit?.c; const i = hit?.i ?? 0;
  const f = fitO2(c, o2), gOk = fitG(c, g);
  const r = c?.o2_pct;
  return (
    <p className="hab-fit">
      {r ? (
        <span className="hab-chip" data-fit={f === null ? "neutral" : f === "at" ? "in" : f === "span" || f === "near" ? "span" : f === "between" ? "none" : f}>
          {r.values?.length && r.values.length <= 3 ? (
            <>O2 {r.approx ? "about " : ""}{r.values.map((x, j) => <span key={j}>{j > 0 && (j === r.values!.length - 1 ? " and " : ", ")}<Num source={cell(CONDITIONS_FILE, 0, `conditions[${i}].o2_pct.values[${j}]`)}>{fmt(x)}</Num></span>)}%</>
          ) : (
            <>O2 {r.approx ? "about " : ""}<Num source={cell(CONDITIONS_FILE, 0, `conditions[${i}].o2_pct.min`)}>{fmt(r.min)}</Num>{r.max !== r.min && <>–<Num source={cell(CONDITIONS_FILE, 0, `conditions[${i}].o2_pct.max`)}>{fmt(r.max)}</Num></>}%</>
          )}
          {f === "at" ? " · yours tested" : f === "near" ? " · near yours" : f === "span" ? " · spans yours" : f === "between" ? " · not yours" : f === "above" ? " · all below yours" : f === "below" ? " · all above yours" : ""}
        </span>
      ) : (
        <span className="hab-chip" data-fit={o2 === null ? "neutral" : "none"}>O2 not given</span>
      )}
      <span className="hab-chip" data-fit={gOk ? "in" : atG(c, g) ? "span" : "below"}>{gOk ? `ran ${GRAV_CHIP[g]}` : atG(c, g) ? (g === "orbit" ? "not flown" : "not run on Earth") : `not ${GRAV_CHIP[g]}`}</span>
    </p>
  );
}

/** The long side of the chips, for an opened row: O2 notes, what the record says when it gives no number, and why a gravity chip says it wasn't run there. */
function FitDetail({ iv, g }: { iv: Inv; g: Grav }) {
  const c = COND.get(iv.accession)?.c;
  const items = [
    ...(c?.o2_pct?.notes ?? []).map((n) => `O2 note: ${n.replace(/,?\s*as quoted in [^)]*/g, "")}`),
    ...(!c?.o2_pct && c?.not_reported?.o2_pct ? [`O2: ${c.not_reported.o2_pct}`] : []),
    ...(atG(c, g) && !fitG(c, g) ? [`Gravity: ${notRun(c, g)}`] : []),
  ];
  return items.length ? <ul className="hab-fit-detail">{items.map((t, j) => <li key={j}>{t}</li>)}</ul> : null;
}

function Strip({ iv, on }: { iv: Inv; on: string }) {
  return (
    <span className="inv-strip" aria-hidden="true">
      {SETTINGS.map((s) => (
        <span key={s} className="inv-bar" data-on={on === s} title={`${SETTING_NAMES[s] ?? s}: ${iv.relevance[s]?.score}`}>
          <span style={{ height: `${((iv.relevance[s]?.score ?? 0) / TOP) * 100}%` }} />
        </span>
      ))}
    </span>
  );
}

function Conditions({ on }: { on: string }) {
  return (
    <div className="hab-cond">
      <p className="hab-lives">{LIVES_IN[on]}</p>
      {on === "lunar_base" && (MOON_BASE || LUNAR_G) && (
        <dl className="hab-figs">
          {LUNAR_G && <div><dt>Gravity</dt><dd className="num"><Num source={LUNAR_G.source}>{String(LUNAR_G.value)} g</Num></dd></div>}
          {MOON_BASE && <div><dt>Planned air</dt><dd><Num source={cell(MOONGAP_FILE, 0, "reference_lines.moon_base_o2.o2_pct")}>{MOON_BASE.label.replace(/^Planned Moon base:\s*/i, "")}</Num></dd></div>}
        </dl>
      )}
    </div>
  );
}

function Gaps({ on }: { on: string }) {
  const strong = ALL.filter((iv) => (iv.relevance[on]?.score ?? 0) >= TOP - 1);
  const nFlew = ALL.filter(flew).length;
  const best = [...ALL].sort((a, b) => (b.relevance[on]?.score ?? 0) - (a.relevance[on]?.score ?? 0) || accNum(a) - accNum(b))[0];
  return (
    <aside className="hab-gaps" aria-labelledby="hab-gaps-h">
      <h3 id="hab-gaps-h">Gaps in the data for {IN_SENTENCE[on] ?? SETTING_NAMES[on]}</h3>
      <ul>
        {PARTIAL_HABITATS.has(on) ? (
          <>
            <li><strong className="num">{partialG.length === 0 ? "None" : partialG.length}</strong> of the {N} burned anything at Moon or Mars gravity.</li>
            <li>Closest: NASA's lunar-gravity drop tests, in <a href="/research#moon">the Moon Gap</a>.</li>
            <li>Our test of the challenge page's idea that orbit and Earth results bound partial gravity: a flame model fitted to both ends still can't say how the flame's own airflow changes in between (<a href="/model">the flame model</a>).</li>
            {PARTIAL_QUOTES.length > 0 && (
              <li className="hab-quotes">
                <More className="hab-more" summary="What the challenge page says">
                  <ul>{PARTIAL_QUOTES.map((q) => <li key={q.id} className="hab-quote">“{q.text}”</li>)}</ul>
                </More>
              </li>
            )}
          </>
        ) : (
          <>
            <li><strong className="num">{nFlew}</strong> of the {N} flew in orbit.</li>
            <li><strong className="num">{strong.length}</strong> score {TOP - 1} or {TOP} here; the top one is {name(best)}.</li>
          </>
        )}
      </ul>
      <More className="hab-more" summary={`Conditions for ${IN_SENTENCE[on] ?? SETTING_NAMES[on]}`}>
        <Conditions on={on} />
      </More>
    </aside>
  );
}

function Compare({ ids, on, clear }: { ids: string[]; on: string; clear: () => void }) {
  const picked = ids.map((id) => ALL.find((iv) => iv.accession === id)!).filter(Boolean);
  const rows: [string, (iv: Inv) => ReactNode][] = [
    ["Type", (iv) => iv.investigation_type],
    ["Where", (iv) => iv.platform],
    ["Gravity", (iv) => iv.gravity],
    ["What burned", (iv) => iv.fuel_sample],
    ["Oxygen", (iv) => iv.atmosphere?.o2 ?? "not given"],
    ["Pressure", (iv) => iv.atmosphere?.pressure ?? "not given"],
    ["Airflow", (iv) => iv.flow],
    ["Sensors", (iv) => (iv.diagnostics?.length ? iv.diagnostics.join(", ") : "not given")],
    ["Key finding", (iv) => iv.key_finding],
    [`For ${IN_SENTENCE[on] ?? SETTING_NAMES[on]}`, (iv) => <><Num source={scoreSrc(iv, on)}>{iv.relevance[on]?.score} of {TOP}</Num> {iv.relevance[on]?.why}</>],
    ["Open", (iv) => <a href={iv.psi_url}>NASA PSI record</a>],
  ];
  return (
    <section className="hab-compare" id="compare" aria-labelledby="compare-h">
      <div className="hab-compare-head">
        <h3 id="compare-h">Side by side</h3>
        <button type="button" className="textlink as-link" onClick={clear}>Clear</button>
      </div>
      <div className="scroll-x" role="region" aria-labelledby="compare-h" tabIndex={0}>
        <table className="data hab-table">
          <thead><tr><th scope="col"><span className="sr">Field</span></th>{picked.map((iv) => <th key={iv.accession} scope="col">{name(iv)}<span className="inv-sub"> · {iv.accession}</span></th>)}</tr></thead>
          <tbody>{rows.map(([k, f]) => <tr key={k}><th scope="row">{k}</th>{picked.map((iv) => <td key={iv.accession}>{f(iv)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

export function Habitats() {
  const [on, setOn] = useState<string>(SETTINGS.includes("lunar_base") ? "lunar_base" : SETTINGS[0]);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [cmp, setCmp] = useState<string[]>([]);
  const MAX_CMP = 3;
  const presetO2 = (s: string) => (s === "lunar_base" && MOON_BASE ? String(MOON_BASE.o2_pct) : "");
  const [o2s, setO2s] = useState(() => presetO2(SETTINGS.includes("lunar_base") ? "lunar_base" : SETTINGS[0]));
  const [g, setG] = useState<Grav>(PRESET_GRAV[SETTINGS.includes("lunar_base") ? "lunar_base" : SETTINGS[0]] ?? "orbit");
  const [only, setOnly] = useState(false);
  const [hw, setHw] = useState<string>("all");
  const spot = useRowSpotlight<HTMLOListElement>();
  const o2 = num(o2s);
  const pick = (s: string) => { setOn(s); setG(PRESET_GRAV[s] ?? "orbit"); setO2s(presetO2(s)); };
  const covers = (iv: Inv) => { const c = COND.get(iv.accession)?.c; return fitG(c, g) && (o2 === null || includes(fitO2(c, o2))); };
  const fits = o2 === null ? [] : ALL.map((iv) => fitO2(COND.get(iv.accession)?.c, o2));
  const nO2 = o2 === null ? null : fits.filter(includes).length;
  const nAt = fits.filter((f) => f === "at").length;
  const nG = ALL.filter((iv) => fitG(COND.get(iv.accession)?.c, g)).length;
  const nBoth = ALL.filter(covers).length;

  const ranked = useMemo(
    () => [...ALL].sort((a, b) => (b.relevance[on]?.score ?? 0) - (a.relevance[on]?.score ?? 0) || total(b) - total(a) || accNum(a) - accNum(b)),
    [on],
  );
  const SHOW = 8;
  const pool = (only ? ranked.filter(covers) : ranked).filter((iv) => hw === "all" || COND.get(iv.accession)?.c.hardware_group === hw);
  const rows = all || only ? pool : pool.slice(0, SHOW);
  const toggle = (id: string) => setCmp((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < MAX_CMP ? [...c, id] : c));
  // the site's own glide (eased like every anchor; at once under reduced motion or Pause), not the browser's smooth scroll
  const goCompare = () => { const el = document.getElementById("compare"); if (el) void scrollToElement(el); };

  return (
    <section className="panel invest habitats" id="habitats" aria-labelledby="hab-h">
      <div className="panel-head">
        <h2 id="hab-h" className="t-display-l">NASA fire investigations, ranked by habitat</h2>
        <p>Choose a habitat to rank {N} NASA fire investigations from its PSI archive by how much they tell you about a fire there.</p>
      </div>

      <div className="seg hab-pick" role="group" aria-label="Habitat">
        {SETTINGS.map((s) => <button key={s} type="button" aria-pressed={on === s} onClick={() => pick(s)}>{SETTING_NAMES[s] ?? s}</button>)}
      </div>

      <form className="hab-form" onSubmit={(e) => e.preventDefault()} aria-labelledby="hab-form-h">
        <h3 id="hab-form-h" className="sr">Describe your habitat</h3>
        <label className="hab-field">
          <span>Oxygen in the air (%)</span>
          <input type="number" inputMode="decimal" min={0} max={100} step={0.5} value={o2s} onChange={(e) => setO2s(e.target.value)} placeholder="type a value" />
        </label>
        <div className="hab-field" role="group" aria-label="Gravity">
          <span>Gravity</span>
          <div className="seg small">
            {(Object.keys(GRAV_NAMES) as Grav[]).map((k) => <button key={k} type="button" aria-pressed={g === k} onClick={() => setG(k)}>{GRAV_NAMES[k]}</button>)}
          </div>
        </div>
        <p className="hab-cover" role="status">
          {nO2 !== null && <><strong className="num">{nO2}</strong> of {N} include {fmt(o2!)}% oxygen{nAt > 0 && <> ({nAt} as a tested level)</>}. </>}
          <strong className="num">{nG}</strong> of {N} ran {GRAV_AT[g]}{nO2 !== null ? <>; <strong className="num">{nBoth}</strong> at both</> : ""}.
        </p>
        {o2 !== null && (
          <More className="hab-more" summary="Why a match isn't proof">
            <p className="hab-note">Each record reports oxygen, pressure and airflow as separate spans over all its tests, so a match here doesn't confirm your exact combination was tested. Oxygen % also leaves out total pressure: the same % at lower pressure means less oxygen.</p>
          </More>
        )}
        <label className="hab-only"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Show only investigations that include these conditions</label>
      </form>

      <Gaps on={on} />

      <div className="inv-tools">
        <p className="inv-legend" aria-hidden="true">
          <span className="inv-strip"><span className="inv-bar" data-on="true"><span style={{ height: "100%" }} /></span></span>
          score for each habitat, left to right: {SETTINGS.map((s) => SETTING_NAMES[s] ?? s).join(", ")}
        </p>
        <p className="inv-legend">Tick up to {MAX_CMP} to compare.</p>
        <label className="hab-hw">Hardware{" "}
          <select value={hw} onChange={(e) => { setHw(e.target.value); setAll(true); }}>
            <option value="all">All {N}</option>
            {HW_GROUPS.map(([id, label, n]) => <option key={id} value={id}>{label} ({n})</option>)}
          </select>
        </label>
      </div>

      <ol className="inv-list hab-list" ref={spot} data-element="row-spotlight">
        {rows.map((iv, i) => {
          const isOpen = open === iv.accession;
          const paper = iv.key_papers?.find((p) => p.doi);
          const picked = cmp.includes(iv.accession);
          return (
            <li key={iv.accession} data-open={isOpen} data-picked={picked}>
              <label className="hab-tick">
                <input type="checkbox" checked={picked} disabled={!picked && cmp.length >= MAX_CMP} onChange={() => toggle(iv.accession)} />
                <span className="sr">Compare {name(iv)}</span>
              </label>
              <button type="button" className="inv-row" aria-expanded={isOpen} aria-controls={`inv-${iv.accession}`} onClick={() => setOpen(isOpen ? null : iv.accession)}>
                <span className="inv-rank num">{i + 1}</span>
                <span className="inv-name">
                  <strong>{name(iv)}</strong>
                </span>
                <Strip iv={iv} on={on} />
                <span className="inv-score num"><span className="sr">{SETTING_NAMES[on]} score </span>{iv.relevance[on]?.score}</span>
                <span className="inv-finding hab-brief">{brief(iv.relevance[on]?.why ?? "")}</span>
              </button>
              <FitLine iv={iv} o2={o2} g={g} />
              {isOpen && (
                <div className="inv-more" id={`inv-${iv.accession}`}>
                  <div className="hab-detail">
                    <p className="inv-sub">{iv.acronym ? iv.full_name : iv.investigation_type} · {iv.accession}</p>
                    <p><span className="hab-why">{`${iv.relevance[on]?.why ?? ""} `}</span>{iv.key_finding}</p>
                    <FitDetail iv={iv} g={g} />
                    <LivePsi accession={iv.accession} />
                  </div>
                  <dl className="inv-facts">
                    <div><dt>Where</dt><dd>{iv.platform}; {iv.gravity}</dd></div>
                    <div><dt>What burned</dt><dd>{iv.fuel_sample}</dd></div>
                    <div><dt>Oxygen</dt><dd>{iv.atmosphere?.o2}</dd></div>
                    <div><dt>Airflow</dt><dd>{iv.flow}</dd></div>
                    {COND.get(iv.accession)?.c.hardware_label && <div><dt>Hardware</dt><dd>{COND.get(iv.accession)!.c.hardware_label}{iv.hardware && iv.hardware !== "n/a" ? ` (${iv.hardware})` : ""}</dd></div>}
                    {(iv.diagnostics?.length ?? 0) > 0 && <div><dt>Sensors</dt><dd>{iv.diagnostics!.join("; ")}</dd></div>}
                  </dl>
                  <ul className="inv-why">
                    {SETTINGS.map((s) => (
                      <li key={s}><span className="k">{SETTING_NAMES[s] ?? s} <Num source={scoreSrc(iv, s)}>{iv.relevance[s]?.score}</Num></span> {iv.relevance[s]?.why}</li>
                    ))}
                  </ul>
                  <div className="hab-actions">
                    <button type="button" className="btn" onClick={() => askIgnos({ question: `Summarize NASA's ${name(iv)} investigation (${iv.accession}): what it burned, under what conditions, and what it found.`, mode: "summarize", subject: { kind: "test", id: iv.accession } })}>Ask about this</button>
                    <a className="btn ghost" href={iv.psi_url}>Open the NASA record</a>
                    {paper && <a className="textlink" href={`https://doi.org/${paper.doi}`}>Key paper</a>}
                    {iv.accession === MEASURED && <a className="textlink" href="/research#measure">Our measurements from its photos</a>}
                  </div>
                  <p className="caption">Finding from {iv.key_finding_source}.</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {only && pool.length === 0 && <p className="hab-none">None of the {N} cover these conditions. {g === "partial"
        ? <>That is the gap: none of these {N} PSI records ran at Moon or Mars gravity.{NO_PARTIAL_G && <> The challenge page: “{NO_PARTIAL_G}”</>}</>
        : hw !== "all" ? "Try Hardware: All, or a different oxygen level." : "Try a different oxygen level."}</p>}
      {!all && !only && N > SHOW && <button type="button" className="btn ghost inv-all" onClick={() => setAll(true)}>Show all {N}</button>}

      {cmp.length > 0 && (
        <div className="hab-bar" role="status">
          <span>{cmp.length === 1 ? "Pick one more to compare" : `${cmp.length} picked`}</span>
          {cmp.length > 1 && <button type="button" className="btn" onClick={goCompare}>Compare</button>}
        </div>
      )}
      {cmp.length > 1 && <Compare ids={cmp} on={on} clear={() => setCmp([])} />}

      {/* context for the ranking, after it: the ranked list is the page's result */}
      <AtmosphereCard />

      <More className="hab-more" summary="How these investigations connect">
        <ProvenanceLine />
      </More>

      <More className="hab-more" summary="Scores are the team's judgment, not NASA's">
        <p className="caption">{investigations.relevance_note}</p>
      </More>
    </section>
  );
}
