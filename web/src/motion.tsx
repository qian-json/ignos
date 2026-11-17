// Written with AI assistance (Claude Code)
// One switch for every animation that runs on its own (the opening scene's flame and airflow, the
// replay's flicker), kept apart from the system's reduced-motion setting. The reader's Pause choice and
// the system setting are two separate inputs; motion holds still while either asks for it. The system
// setting is followed live, so turning it off again lets everything move without a reload, and the
// reader's own Pause stays exactly as they left it.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const RMQ = "(prefers-reduced-motion: reduce)";
const systemReduced = () => typeof matchMedia !== "undefined" && matchMedia(RMQ).matches;

interface Motion {
  /** Hold still: the reader paused, or the system asks for reduced motion. */
  paused: boolean;
  /** The reader's own Pause choice, whatever the system says. */
  userPaused: boolean;
  /** The system's reduced-motion setting, live. */
  reduced: boolean;
  /** Set the reader's Pause choice. */
  setPaused: (p: boolean) => void;
}

const MotionCtx = createContext<Motion>({ paused: systemReduced(), userPaused: false, reduced: systemReduced(), setPaused: () => {} });
export const useMotion = () => useContext(MotionCtx);

export function MotionProvider({ children }: { children: ReactNode }) {
  const [userPaused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(systemReduced);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia(RMQ);
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const paused = userPaused || reduced;
  const value = useMemo(() => ({ paused, userPaused, reduced, setPaused }), [paused, userPaused, reduced]);
  // CSS loops (the docked headline's hover) and every element read <html data-motion>: "paused" while
  // either input asks for stillness, "on" as soon as neither does
  useEffect(() => { document.documentElement.dataset.motion = paused ? "paused" : "on"; }, [paused]);
  return <MotionCtx.Provider value={value}>{children}</MotionCtx.Provider>;
}

export function PauseButton({ tone }: { tone?: "dark" | "light" }) {
  const { userPaused, reduced, setPaused } = useMotion();
  // the system already holds everything still: say so instead of offering a switch that changes nothing
  const bySystem = reduced && !userPaused;
  return (
    <button
      type="button"
      className={`motion-toggle${tone === "dark" ? " on-dark" : ""}`}
      aria-pressed={userPaused}
      aria-disabled={bySystem || undefined}
      title={bySystem ? "Your system asks for reduced motion, so moving parts hold still" : undefined}
      onClick={() => { if (!bySystem) setPaused(!userPaused); }}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        {userPaused || bySystem ? <path d="M4 2.5v11l9-5.5z" fill="currentColor" /> : <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />}
      </svg>
      <span className="mt-label">{bySystem ? "Motion reduced" : userPaused ? "Play motion" : "Pause all motion"}</span>
    </button>
  );
}
