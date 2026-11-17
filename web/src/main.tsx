// Written with AI assistance (Claude Code)
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./elements/display-type.css";
import "./polish.css";

// A tab left open across a deploy asks for page chunks that no longer exist, and the page went blank.
// Reload once to pick up the new build; the time guard stops a reload loop if the chunk is really missing.
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "ignos-chunk-reload";
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
