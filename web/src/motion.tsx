// Written with AI assistance (Claude Code)
// One switch for every animation that runs on its own (the opening scene's flame and airflow, the
// replay's flicker). Starts paused when the reader asked their system for less motion.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const MotionCtx = createContext<{ paused: boolean; setPaused: (p: boolean) => void }>({ paused: reduced, setPaused: () => {} });
export const useMotion = () => useContext(MotionCtx);

export function MotionProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(reduced);
  const value = useMemo(() => ({ paused, setPaused }), [paused]);
  // CSS loops (the docked headline's hover) read this
  useEffect(() => { document.documentElement.dataset.motion = paused ? "paused" : "on"; }, [paused]);
  return <MotionCtx.Provider value={value}>{children}</MotionCtx.Provider>;
}

export function PauseButton({ tone }: { tone?: "dark" | "light" }) {
  const { paused, setPaused } = useMotion();
  return (
    <button type="button" className={`motion-toggle${tone === "dark" ? " on-dark" : ""}`} onClick={() => setPaused(!paused)}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        {paused ? <path d="M4 2.5v11l9-5.5z" fill="currentColor" /> : <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />}
      </svg>
      <span className="mt-label">{paused ? "Play motion" : "Pause all motion"}</span>
    </button>
  );
}
