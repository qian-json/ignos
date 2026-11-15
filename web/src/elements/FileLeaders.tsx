// Written with AI assistance (Claude Code)
// The files behind the checker, set like the credits on a record sleeve: file name, a row of dots,
// how many checkable facts the build step read from it. The names and counts come from the fact
// index the build writes (facts.json); nothing here is typed. The dots are a background on the list,
// one row per line, so they line up down the column and screen readers never hear them.
import type { NumberSource } from "@still-air/proof";
import { FACTS, FACT_FILES } from "../data";
import { Num } from "../Num";
import "./file-leaders.css";

const INDEX_FILE = "web/src/generated/facts.json";
const counted = (i: number): NumberSource => ({ file: INDEX_FILE, row: 0, column: `files[${i}].facts`, sha256: "", derived: "facts read from this file by scripts/build-facts.mjs" });
const total: NumberSource = { file: INDEX_FILE, row: 0, column: "facts.length", sha256: "", derived: "every checkable fact in the index" };

export function FileLeaders({ labelledBy }: { labelledBy?: string }) {
  const rows = FACT_FILES.map((f, i) => ({ ...f, i })).filter((f) => f.facts > 0);
  return (
    <ul className="fl" data-element="file-leaders" aria-labelledby={labelledBy}>
      {rows.map((f) => {
        const cut = f.file.lastIndexOf("/") + 1;
        return (
          <li key={f.file} className="fl-row">
            {cut > 0 && <span className="fl-w fl-dir">{f.file.slice(0, cut)}</span>}
            <span className="fl-w fl-name">{f.file.slice(cut)}</span>
            <span className="fl-w fl-n"><Num source={counted(f.i)} label={`${f.facts} facts from ${f.file}`}>{f.facts}</Num></span>
          </li>
        );
      })}
      <li className="fl-row fl-total">
        <span className="fl-w fl-name">Total</span>
        <span className="fl-w fl-n"><Num source={total} label={`${FACTS.length} facts in all`}>{FACTS.length}</Num></span>
      </li>
    </ul>
  );
}
