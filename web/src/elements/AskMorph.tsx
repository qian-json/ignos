// Written with AI assistance (Claude Code)
// The Ask request as one shape: question → sources read → each number checked → green or flagged →
// "Open the data". Each step appears only when the fetch has really reached it; the answer itself is
// rendered by the panel straight away and never waits for the shape.
import { useEffect, useMemo, useRef } from "react";
import type { AskResponse } from "@still-air/proof";
import { askMorph, type Step } from "./morphEngine";
import "./ask-morph.css";

export type AskPhase =
  | { kind: "idle" }
  | { kind: "sending"; question: string }
  | { kind: "answered"; question: string; res: AskResponse; canOpen: boolean }
  | { kind: "failed"; question: string; code: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function stepsFor(p: AskPhase): Step[] {
  if (p.kind === "idle") return [];
  const ask: Step = { key: "q", tone: "ink", icon: "spin", text: p.question, say: "Asking the data." };
  if (p.kind === "sending") return [ask];
  if (p.kind === "failed")
    return [ask, p.code === "not_configured"
      ? { key: "err", tone: "quiet", icon: "stop", text: "Ask isn't set up on this site yet", say: "Ask isn't set up on this site yet." }
      : { key: "err", tone: "flag", icon: "stop", text: "No answer came back", say: "No answer came back." }];
  const { res, canOpen } = p, g = res.gate, n = res.citations.length;
  if (res.status === "not_in_data") return [ask, { key: "none", tone: "quiet", icon: "doc", text: "Not in NASA's data or our sources", say: "The sources don't answer this question." }];
  const out: Step[] = [ask, { key: "src", tone: "card", icon: "doc", text: n ? `Read ${plural(n, "source", "sources")}` : "Answered without a citation", say: n ? `Read ${plural(n, "source", "sources")}.` : "No sources cited." }];
  if (g.checked > 0) {
    const done = g.action === "removed" ? "removed" : "flagged";
    out.push({ key: "num", tone: "card", text: `Checking ${plural(g.checked, "number", "numbers")}`, dots: g.numbers.map((x) => x.status), say: `Checking ${plural(g.checked, "number", "numbers")}.` });
    out.push(g.unverified === 0
      ? { key: "ok", tone: "ok", icon: "tick", text: g.checked === 1 ? "The number holds up" : `All ${g.checked} numbers hold up`, say: `All ${g.checked} numbers verified.` }
      : { key: "flag", tone: "flag", icon: "flag", text: `${g.unverified} ${done}, ${g.verified} verified`, say: `${plural(g.unverified, "number", "numbers")} ${done}, ${g.verified} verified.` });
  } else out.push({ key: "nonum", tone: "card", icon: "tick", text: "No numbers to check", say: "No numbers to check." });
  if (canOpen) out.push({ key: "open", tone: "flame", icon: "down", text: "Open the data", action: true, say: "Open the data is ready." });
  return out;
}

export function AskMorph({ phase, onOpen }: { phase: AskPhase; onOpen: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const api = useRef<ReturnType<typeof askMorph> | null>(null);
  const open = useRef(onOpen);
  open.current = onOpen;
  const steps = useMemo(() => stepsFor(phase), [phase]);
  useEffect(() => {
    const m = askMorph(root.current!, () => open.current());
    api.current = m;
    return () => { m.destroy(); api.current = null; };
  }, []);
  useEffect(() => { api.current?.set(steps); }, [steps]);
  return <div ref={root} className="amx" data-element="ask-morph" role="group" aria-label="Where your question is" hidden />;
}
