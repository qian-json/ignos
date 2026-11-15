// Written with AI assistance (Claude Code)
// Shared state between the burn replay and the charts: which test is open and which photo the
// replay is showing, so the edge chart's cursor follows the scrubber.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export interface ReplayState {
  test: string;
  setTest: (t: string) => void;
  /** t_s of the photo the replay is on, or null before it starts. */
  cursor: number | null;
  setCursor: (t: number) => void;
}

export const ReplayCtx = createContext<ReplayState>({ test: "", setTest: () => {}, cursor: null, setCursor: () => {} });
export const useReplay = () => useContext(ReplayCtx);

/** Holds the state itself, so only the components that read it re-render while the replay plays. */
export function ReplayProvider({ first, children }: { first: string; children: ReactNode }) {
  const [test, setTest] = useState(first);
  const [cursor, setCursor] = useState<number | null>(null);
  const value = useMemo(() => ({ test, setTest, cursor, setCursor }), [test, cursor]);
  return <ReplayCtx.Provider value={value}>{children}</ReplayCtx.Provider>;
}
