// Written with AI assistance (Claude Code)
// A short note in the browser console for people who open the developer tools: where the numbers
// on the page come from, and where the checks are explained. Printed once per page load.
import { useEffect } from "react";

let printed = false;

export function ConsoleNote() {
  useEffect(() => {
    if (printed) return;
    printed = true;
    const flame = getComputedStyle(document.documentElement).getPropertyValue("--flame").trim() || "inherit";
    const head = `font: 600 13px/1.6 "Fragment Mono", ui-monospace, Menlo, monospace; color: ${flame};`;
    const body = `font: 400 12px/1.6 "Fragment Mono", ui-monospace, Menlo, monospace;`;
    const lines = [
      "Every figure on this page is read from a data file, never typed by hand:",
      "the project's CSV and JSON data files (data/derived/, data/reference/ and web/src/data/",
      "in its source). Click or focus any figure to see its file, row and column.",
      `How we check them: ${location.origin}/#method`,
    ];
    console.info(`%cIgnos, for the curious\n%c${lines.join("\n")}`, head, body);
  }, []);
  return <span hidden data-element="console-note" />;
}
