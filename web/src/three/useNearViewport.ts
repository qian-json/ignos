// Written with AI assistance (Claude Code)
// When a heavy 3D panel should hold a live WebGL scene: from the moment it comes within `enter` of the
// screen until it is more than `leave` away. The gap between the two keeps a reader who scrolls back
// and forth near the edge from rebuilding the scene each time; a page change unmounts the panel and
// its scene with it. So a long page keeps only the scenes near the reader alive, never all of them.
import { useEffect, useState, type RefObject } from "react";

/** `key`: pass something that changes when the element itself is swapped or first rendered later. */
export function useNearViewport(ref: RefObject<Element>, { enter = "300px", leave = "150%", key }: { enter?: string; leave?: string; key?: unknown } = {}): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const coming = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true); }, { rootMargin: `${enter} 0px` });
    const going = new IntersectionObserver(([e]) => { if (!e.isIntersecting) setNear(false); }, { rootMargin: `${leave} 0px` });
    coming.observe(el);
    going.observe(el);
    return () => { coming.disconnect(); going.disconnect(); };
  }, [ref, enter, leave, key]);
  return near;
}
