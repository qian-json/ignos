// Written with AI assistance (Claude Code)
// A "details" toggle that keeps long text out of the first read. Children mount only when it is open,
// so charts and moving elements inside measure themselves at their real size and cost nothing while closed.
import { useState, type ReactNode } from "react";
import "./more.css";

export function More({ summary = "Details", children, open: startOpen = false, className }: { summary?: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <details className={`more${className ? ` ${className}` : ""}`} open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{summary}</summary>
      {open && <div className="more-body">{children}</div>}
    </details>
  );
}
