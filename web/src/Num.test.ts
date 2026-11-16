// Written with AI assistance (Claude Code)
// The source card behind every number must stay open after a tap: a touch fires emulated hover and
// focus before its click, and the click used to toggle the card shut again.
import { describe, expect, it } from "vitest";
import { popHandlers } from "./Num";

function card() {
  let open = false;
  const h = popHandlers(() => { open = true; }, () => { open = false; });
  return { h, isOpen: () => open };
}

describe("popHandlers", () => {
  it("stays open after a tap (touch hover, focus, then click)", () => {
    const { h, isOpen } = card();
    h.onPointerEnter({ pointerType: "touch" });
    h.onFocus();
    h.onClick();
    expect(isOpen()).toBe(true);
  });

  it("ignores hover from touch and pen", () => {
    const { h, isOpen } = card();
    h.onPointerEnter({ pointerType: "touch" });
    h.onPointerEnter({ pointerType: "pen" });
    expect(isOpen()).toBe(false);
    h.onClick();
    h.onPointerLeave({ pointerType: "touch" });
    expect(isOpen()).toBe(true);
  });

  it("opens on mouse hover, stays open on click, closes on leave", () => {
    const { h, isOpen } = card();
    h.onPointerEnter({ pointerType: "mouse" });
    expect(isOpen()).toBe(true);
    h.onClick();
    expect(isOpen()).toBe(true);
    h.onPointerLeave({ pointerType: "mouse" });
    expect(isOpen()).toBe(false);
  });

  it("opens on keyboard focus and closes on blur", () => {
    const { h, isOpen } = card();
    h.onFocus();
    expect(isOpen()).toBe(true);
    h.onBlur();
    expect(isOpen()).toBe(false);
  });
});
