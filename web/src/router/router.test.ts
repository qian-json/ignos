// Written with AI assistance (Claude Code)
// The router reads the address when it loads; a "/#100%" link used to throw there and blank the app.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("router at load", () => {
  it("loads on a link with a malformed escape in its hash", async () => {
    vi.stubGlobal("location", new URL("https://example.org/#100%"));
    const router = await import("./router");
    expect(router.currentPage()).toBe("home");
  });

  it("re-exports the Ask hand-over the Ask panel takes on mount", async () => {
    vi.stubGlobal("location", new URL("https://example.org/ask"));
    const router = await import("./router");
    const pending = await import("./pendingAsk");
    expect(router.currentPage()).toBe("ask");
    pending.holdAsk({ question: "Does turning off the fans put out a fire in orbit?", mode: "interpret" });
    expect(router.takePendingAsk()).toEqual({ question: "Does turning off the fans put out a fire in orbit?", mode: "interpret" });
    expect(router.takePendingAsk()).toBeNull();
  });
});
