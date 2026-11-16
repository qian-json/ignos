// Written with AI assistance (Claude Code)
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { gateAnswer, type AskMode, type AskResponse, type GateNumber } from "@still-air/proof";
import { ASK_EVENT, RESEARCH_QUESTIONS, type AskRequest } from "../AskBar";
import { sourceLinks } from "../sources";
import { Num } from "../Num";
import { FACTS, MATERIAL_NAMES, moongap, spread, tableS1, validated } from "../data";
import { AskMorph, type AskPhase } from "../elements/AskMorph";
import { VerifySpark } from "../elements/VerifySpark";

/** The answer text with every checked number marked: green with its source, or amber. */
function Gated({ text, numbers }: { text: string; numbers: GateNumber[] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  [...numbers].filter((n) => n.start !== null).sort((a, b) => a.start! - b.start!).forEach((n, i) => {
    parts.push(text.slice(at, n.start!));
    const t = text.slice(n.start!, n.end!);
    parts.push(n.status === "verified" && n.source ? <span key={i} className="g-ok"><Num source={n.source} label={`${t}, verified`}>{t}</Num></span> : <span key={i} className="g-no" title="Not found in our data or sources">{t}</span>);
    at = n.end!;
  });
  parts.push(text.slice(at));
  return <p className="gated">{parts}</p>;
}

/** Where each cited source lives: NASA's archive, the paper, or a panel on this page. */
function OpenData({ citations }: { citations: AskResponse["citations"] }) {
  const { links, unlinked } = sourceLinks(citations);
  if (!links.length && !unlinked.length) return null;
  return (
    <div className="open-data">
      <span className="od-k">Open the data</span>
      <ul>
        {links.map((l) => <li key={l.href}><a href={l.href} {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{l.label}{l.external ? <span className="sr-only"> (opens in a new tab)</span> : null}</a></li>)}
        {unlinked.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </div>
  );
}

/** One key per set of verified numbers, so the edge light runs once per new verification, not per keystroke. */
const verifiedKey = (numbers: GateNumber[]) =>
  numbers.filter((n) => n.status === "verified" && n.source).map((n) => `${n.text}@${n.source && "file" in n.source ? `${n.source.file}:${n.source.row}:${n.source.column}` : n.source && "paper" in n.source ? n.source.paper : ""}`).join("|");

function Summary({ gate }: { gate: AskResponse["gate"] }) {
  if (gate.checked === 0) return <p className="gate-sum">No numbers to check.</p>;
  return <p className="gate-sum num">{gate.verified} of {gate.checked} numbers verified against our data and sources{gate.unverified ? `; ${gate.unverified} not found (amber)` : ""}.</p>;
}

// Example sentences are built from the data files, so the page itself types no science.
function examples(): { label: string; text: string }[] {
  const ok = spread.find(validated)!;
  const s1 = tableS1.find((r) => r.sample_id === ok.test_id && r.flow_cm_s === ok.flow_cm_s);
  const top = moongap.ranking[0];
  return [
    { label: "A true measurement", text: `Our tracker measured ${ok.test_id} at ${ok.rate_mm_s} mm/s with ${ok.flow_cm_s} cm/s of airflow; NASA's table gives ${s1 ? s1.rate.toFixed(4) : ok.nasa_rate_mm_s} mm/s.` },
    { label: "A Moon Gap claim", text: `For ${MATERIAL_NAMES[top.material]}, the Moon Gap is ${top.gap_pct.toFixed(1)} percentage points.` },
    // deliberately wrong (half again the measured rate), so the gate has something to catch
    { label: "A wrong number", text: `Our tracker measured ${ok.test_id} at ${(Number(ok.rate_mm_s) * 1.5).toFixed(4)} mm/s with ${ok.flow_cm_s} cm/s of airflow.` },
  ];
}

/** The gate every AI answer passes through, run in the browser on any sentence. Shown under How we know. */
export function CheckSentence() {
  const ex = useMemo(examples, []);
  const [claim, setClaim] = useState(ex[2].text);
  const checked = useMemo(() => gateAnswer(claim, { facts: FACTS }), [claim]);
  return (
    <div className="check-sentence">
      <p className="caption">The same check every AI answer passes, run in your browser on {FACTS.length} source-traced numbers. Type a claim or pick an example.</p>
      <div className="row">{ex.map((e) => <button key={e.label} type="button" className="btn ghost" onClick={() => setClaim(e.text)}>{e.label}</button>)}</div>
      <textarea value={claim} onChange={(e) => setClaim(e.target.value)} aria-label="Sentence to check" />
      <VerifySpark verified={checked.gate.verified > 0} result={verifiedKey(checked.gate.numbers)} delay={450}>
        <Gated text={claim} numbers={checked.gate.numbers} />
        <Summary gate={checked.gate} />
      </VerifySpark>
      <p className="caption">A flow speed stated for the Moon is never verified: airflow around a flame on the Moon has not been measured, so any such number is unsupported, even if it matches a value from another setting.</p>
    </div>
  );
}

/** Ask in plain words: one box, example questions, and the checked answer. The top bar and "Ask about this" send questions here. */
export function Ask() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<AskMode>("interpret");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AskResponse | null>(null);
  const [err, setErr] = useState<{ code: string; message: string } | null>(null);
  const [asked, setAsked] = useState("");

  const ask = useCallback(async (question: string, m: AskMode, subject?: AskRequest["subject"]) => {
    setBusy(true); setErr(null); setRes(null); setAsked(question);
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subject ? { question, mode: m, subject } : { question, mode: m }) });
      const body = await r.json().catch(() => null);
      if (r.ok && body) setRes(body as AskResponse);
      else setErr(body?.error ?? { code: String(r.status), message: "The Ask service didn't answer." });
    } catch {
      setErr({ code: "network", message: "Couldn't reach the Ask service. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }, []);

  // the request's real state, for the shape under the Ask button
  const phase = useMemo<AskPhase>(() => {
    if (busy) return { kind: "sending", question: asked };
    if (res) { const l = sourceLinks(res.citations); return { kind: "answered", question: asked, res, canOpen: l.links.length + l.unlinked.length > 0 }; }
    if (err) return { kind: "failed", question: asked, code: err.code };
    return { kind: "idle" };
  }, [busy, res, err, asked]);
  const openData = useCallback(() => {
    const box = document.querySelector<HTMLElement>("#ask .open-data");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    box?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    box?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
  }, []);

  const run = useCallback((r: AskRequest) => { setQ(r.question); setMode(r.mode); void ask(r.question, r.mode, r.subject); }, [ask]);
  const submit = (e: FormEvent) => { e.preventDefault(); if (q.trim() && !busy) void ask(q, mode); };

  // Questions typed in the top bar or sent by "Ask about this" arrive here; so does a shared link (?ask=...).
  useEffect(() => {
    const on = (e: Event) => run((e as CustomEvent<AskRequest>).detail);
    window.addEventListener(ASK_EVENT, on);
    const shared = new URLSearchParams(window.location.search).get("ask")?.trim().slice(0, 500);
    if (shared) run({ question: shared, mode: "interpret" });
    return () => window.removeEventListener(ASK_EVENT, on);
  }, [run]);

  return (
    <section className="panel askblock" id="ask" aria-labelledby="ask-h">
      <div className="panel-head">
        <h2 id="ask-h" className="t-display-l">Ask NASA's fire data</h2>
        <p>An AI answers from NASA's data and papers only; every number is checked against a source before it is shown.</p>
      </div>
      <form className="askband-form" role="search" onSubmit={submit}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500}
          placeholder="e.g. Which materials burn on less oxygen in lunar gravity?" aria-label="Your question" />
        <div className="seg" role="group" aria-label="Mode">
          {(["summarize", "interpret", "rank"] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{{ summarize: "Summarize", interpret: "Interpret", rank: "Rank" }[m]}</button>)}
        </div>
        <button className="btn" type="submit" disabled={busy || !q.trim()}>{busy ? "Checking the sources…" : "Ask"}</button>
      </form>
      <div className="askchips" role="group" aria-label="Example questions">
        {RESEARCH_QUESTIONS.map((r) => <button key={r.question} type="button" className="chip" title={r.question} disabled={busy} onClick={() => run(r)}>{r.label}</button>)}
      </div>
      <div className="ask-out">
        <AskMorph phase={phase} onOpen={openData} />
        {err && (
          <p className="notice">{err.code === "not_configured" ? <>Ask isn't switched on for this site yet: the team is still adding its language-model key. Meanwhile, <a href="/method">Methods and sources</a> runs the same number checker in your browser.</> : err.message}</p>
        )}
        {res && (
          <div className="downlink" key={res.answer.length + ":" + res.gate.checked} style={{ display: "grid", gap: 8 }}>
            {res.mock && <p className="notice">Placeholder answer: this deployment has no language-model key.</p>}
            <VerifySpark verified={res.gate.verified > 0} result={`${res.answer.length}:${verifiedKey(res.gate.numbers)}`} delay={1150}>
              <Gated text={res.answer} numbers={res.gate.numbers} />
              <Summary gate={res.gate} />
            </VerifySpark>
            <OpenData citations={res.citations} />
            {res.citations.length > 0 && <p className="caption">Cited: {res.citations.map((c) => (c.kind === "row" ? c.id : `${c.id}${c.page ? `, p. ${c.page}` : ""}`)).join(" · ")}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
