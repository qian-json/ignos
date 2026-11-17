// Written with AI assistance (Claude Code)
// Three steps for a first visit, right after the film: what to do first, second and third on this site.
import type { MouseEvent } from "react";
import "./start-here.css";

const STEPS: { n: string; title: string; line: string; href: string; cta: string }[] = [
  { n: "1", title: "Pick a habitat", line: "Choose where a crew will live and enter its oxygen and gravity. NASA's fire investigations (from its Physical Sciences Informatics archive, PSI) are ranked by what they tell you about a fire there, with the gaps nobody has tested.", href: "/habitats", cta: "Open Habitats" },
  { n: "2", title: "Ask the data", line: "Ask a question in plain words. The answer cites NASA's data and papers, and every number in it is checked against its source.", href: "/ask", cta: "Open Ask" },
  { n: "3", title: "Check any number", line: "Every dotted number opens to its file, row and column. Method shows how each one was measured and checked.", href: "/method", cta: "Open Method" },
];

export function StartHere({ onPick }: { onPick: (href: string, e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <section className="start-here" aria-labelledby="start-h" data-element="start-here">
      <div className="start-in">
        <h2 id="start-h" className="t-display-l start-h">Start here</h2>
        <ol className="start-steps">
          {STEPS.map((s) => (
            <li key={s.n} className="start-step">
              <span className="start-n" aria-hidden="true">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.line}</p>
              <a className="btn" href={s.href} onClick={(e) => onPick(s.href, e)}>{s.cta}</a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
