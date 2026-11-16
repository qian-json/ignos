// Written with AI assistance (Claude Code)
// "Flame in freefall": a candle flame on Earth beside one in microgravity, or one flame that morphs
// when gravity is switched off. An illustration, not data: no temperature, size or speed is shown,
// and the shapes follow the challenge text quoted under it. The still drawing renders first (it is
// also the view with no WebGL); the three.js scene loads in its own chunk near the viewport.
import { useEffect, useRef, useState } from "react";
import { useMotion } from "../motion";
import type { FreefallScene, View } from "./freefallScene";
import "./freefall-flames.css";

const QUOTE = "Instead of a flickering teardrop, a candle flame becomes a ghostly blue sphere reliant on diffusion for its oxygen.";
const CHALLENGE = "https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/";
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const EARTH = { name: "On Earth", note: "Hot gas rises and pulls the flame up" };
const MICRO = { name: "In microgravity", note: "Nothing rises; oxygen arrives by diffusion" };

/** The same two candles, drawn flat. */
function Still() {
  return (
    <svg className="ff-still" viewBox="0 4 160 80" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="ff-earth" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#4a6cf2" />
          <stop offset="0.25" stopColor="#ffe9b8" />
          <stop offset="0.7" stopColor="#ffb347" />
          <stop offset="1" stopColor="#7a2a0c" />
        </linearGradient>
        <radialGradient id="ff-micro">
          <stop offset="0.55" stopColor="#2c50cf" stopOpacity="0.15" />
          <stop offset="0.85" stopColor="#7d97ff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#2c50cf" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ff-halo">
          <stop offset="0" stopColor="#ffb347" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
      </defs>
      <line x1="0" x2="160" y1="80" y2="80" stroke="#1c2338" strokeWidth="0.6" />
      {[40, 120].map((x) => (
        <g key={x}>
          <rect x={x - 3} y="58" width="6" height="22" rx="0.6" fill="#ece3d3" />
          <line x1={x} x2={x} y1="58" y2="55.6" stroke="#17120e" strokeWidth="0.5" />
        </g>
      ))}
      <ellipse cx="40" cy="49" rx="9" ry="13" fill="url(#ff-halo)" />
      <path d="M40 40 C42.5 47 43.6 51.5 43.2 54 C42.8 57 37.2 57 36.8 54 C36.4 51.5 37.5 47 40 40 Z" fill="url(#ff-earth)" />
      <circle cx="120" cy="55.6" r="5.2" fill="url(#ff-micro)" />
    </svg>
  );
}

export function FreefallFlames() {
  const stage = useRef<HTMLDivElement>(null);
  const scene = useRef<FreefallScene | null>(null);
  const [live, setLive] = useState(false);
  const [noGL, setNoGL] = useState(false);
  const [view, setView] = useState<View>("compare");
  const [gravity, setGravity] = useState(true);
  const { paused } = useMotion();

  // the 3D scene: loaded only when the panel nears the viewport and WebGL exists
  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    let dead = false;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      try {
        const mod = await import("./freefallScene");
        if (dead) return;
        if (!mod.webglAvailable()) throw new Error("no WebGL");
        scene.current = new mod.FreefallScene(host, { reducedMotion: reduced(), night: css("--night") });
        setLive(true);
      } catch {
        if (!dead) { setNoGL(true); setView("compare"); }
      }
    }, { rootMargin: "200px" });
    io.observe(host);
    return () => {
      dead = true;
      io.disconnect();
      scene.current?.dispose();
      scene.current = null;
      setLive(false);
    };
  }, []);

  useEffect(() => { scene.current?.setPaused(paused); }, [paused, live]);
  useEffect(() => { scene.current?.set(view, gravity); }, [view, gravity, live]);

  const single = view === "single";
  const main = single && !gravity ? MICRO : EARTH;
  const show = (v: View, g: boolean) => { setView(v); setGravity(g); };
  const described = single
    ? `Illustration, not a measurement. One candle with gravity ${gravity ? "on, its flame a tall yellow teardrop pulled upward" : "off, its flame a dim blue sphere round the wick"}.`
    : "Illustration, not a measurement. On the left, a candle on Earth with a tall, flickering yellow teardrop flame and a rising plume; on the right, a candle in microgravity with a dim blue sphere of flame round the wick and nothing rising.";

  return (
    <div className="ff">
      <div className="ff-stage" ref={stage} data-live={live} role="img" aria-label={described}>
        <Still />
        <div className="ff-label" style={{ left: single ? "50%" : "25%" }} aria-hidden="true">
          <b>{main.name}</b><span>{main.note}</span>
        </div>
        <div className="ff-label" style={{ left: "75%", opacity: single ? 0 : 1 }} aria-hidden="true">
          <b>{MICRO.name}</b><span>{MICRO.note}</span>
        </div>
        <span className="ff-tag">Illustration, not a measurement.</span>
      </div>
      {!noGL && <div className="ff-controls">
        <span className="ff-k" id="ff-k">Gravity switch (illustration)</span>
        <div className="seg small" role="group" aria-labelledby="ff-k">
          <button type="button" aria-pressed={!single} onClick={() => show("compare", true)}>Side by side</button>
          <button type="button" aria-pressed={single && gravity} onClick={() => show("single", true)}>Gravity on</button>
          <button type="button" aria-pressed={single && !gravity} onClick={() => show("single", false)}>Gravity off</button>
        </div>
      </div>}
      <p className="caption">
        Drawn, not filmed or measured: shapes and colours are qualitative, after the challenge text below.
        {noGL && " This browser could not start WebGL, so the drawing stays still."}
      </p>
      <blockquote className="ff-quote" cite={CHALLENGE}>
        <p>“{QUOTE}”</p>
        <footer>NASA Space Apps 2026, <a href={CHALLENGE}>Flame in Freefall challenge page</a></footer>
      </blockquote>
      <p className="ff-real"><a href="/research">See a real flame from NASA's space station</a></p>
    </div>
  );
}
