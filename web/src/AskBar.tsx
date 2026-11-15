// Written with AI assistance (Claude Code)
// "Ask first": a search box in the top bar, so a researcher can ask NASA's fire data from anywhere on
// the page. It hands the question to the Ask block, which answers and links sources.
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AskMode } from "@still-air/proof";

export const ASK_EVENT = "ignos:ask";
/** subject: ask about one record (an investigation's PSI number, a test, a material), so its passage comes first. */
export interface AskRequest { question: string; mode: AskMode; subject?: { kind: "test" | "material"; id: string } }

/** Questions a researcher would type, each with a short chip label. Plain words only: the page types no science values. */
export const RESEARCH_QUESTIONS: (AskRequest & { label: string })[] = [
  { label: "Flame-spread investigations", question: "Which NASA investigations studied flame spread over solid materials in microgravity?", mode: "summarize" },
  { label: "Least oxygen on the Moon", question: "Which material kept burning on the least oxygen in lunar gravity?", mode: "rank" },
  { label: "Fans off in orbit", question: "Does turning off the fans put out a fire in orbit?", mode: "interpret" },
  { label: "Our rates vs NASA's", question: "How closely do your low-flow spread rates match NASA's published ones?", mode: "interpret" },
  { label: "Airflow on the Moon", question: "How fast does air move around a flame on the Moon?", mode: "interpret" },
];

/** Send a question to the Ask panel and bring it into view. */
export function askIgnos(req: AskRequest) {
  window.dispatchEvent(new CustomEvent<AskRequest>(ASK_EVENT, { detail: req }));
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("ask")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function useSubmit() {
  const [q, setQ] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (question) askIgnos({ question, mode: "interpret" });
  };
  return { q, setQ, submit };
}

/** Compact box in the top bar. "/" focuses it from anywhere on the page. */
export function AskBar({ tone }: { tone: "dark" | "light" }) {
  const { q, setQ, submit } = useSubmit();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form className={`askbar ${tone === "dark" ? "on-dark" : ""}`} role="search" onSubmit={submit}>
      <input ref={ref} type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500}
        placeholder="Ask NASA's fire data" aria-label="Ask NASA's fire data" aria-keyshortcuts="/" />
      <kbd aria-hidden="true">/</kbd>
    </form>
  );
}
