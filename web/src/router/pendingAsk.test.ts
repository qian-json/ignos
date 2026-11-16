// Written with AI assistance (Claude Code)
// A question asked on another page is handed to the Ask panel exactly once, whenever the panel mounts.
import { describe, expect, it } from "vitest";
import { hasPendingAsk, holdAsk, takePendingAsk } from "./pendingAsk";

describe("takePendingAsk", () => {
  it("returns nothing when no question is waiting", () => {
    takePendingAsk();
    expect(hasPendingAsk()).toBe(false);
    expect(takePendingAsk()).toBeNull();
  });

  it("hands a held question over once", () => {
    const req = { question: "Which material has the largest Moon Gap?", mode: "rank" as const };
    holdAsk(req);
    expect(hasPendingAsk()).toBe(true);
    expect(takePendingAsk()).toEqual(req);
    expect(hasPendingAsk()).toBe(false);
    expect(takePendingAsk()).toBeNull();
  });

  it("keeps only the newest question", () => {
    holdAsk({ question: "first", mode: "interpret" });
    holdAsk({ question: "second", mode: "summarize", subject: { kind: "test", id: "B16" } });
    expect(takePendingAsk()).toEqual({ question: "second", mode: "summarize", subject: { kind: "test", id: "B16" } });
    expect(takePendingAsk()).toBeNull();
  });
});
