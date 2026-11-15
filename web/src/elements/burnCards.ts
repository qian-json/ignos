// Written with AI assistance (Claude Code)
// Card faces for BurnFlow, made in the browser from our own published frames: a column of real burn frames cut
// from each test's frame strip (web/public/frames/<test>/sheet.jpg, laid out as web/src/data/frames.json says),
// and the raw BASS-II photos of test B16, cropped to the card around the flame. No text is drawn on a card.
import frames from "../data/frames.json";

type Strip = { frames: number; cols: number; tile: number[] };
const CARD: [number, number] = [512, 748];
const GROUND = "#05070c";   // the dark of the photos themselves, so a card reads as one print
const ROWS = 7;             // burn frames per strip card
const SPAN: [number, number] = [0.12, 0.88];   // skip the set-up shots at the start and end of a strip

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((done) => {
    const img = new Image(); img.decoding = "async";
    img.onload = () => done(img); img.onerror = () => done(null);
    img.src = src;
  });
}
function canvas() {
  const c = document.createElement("canvas"); c.width = CARD[0]; c.height = CARD[1];
  const x = c.getContext("2d")!; x.fillStyle = GROUND; x.fillRect(0, 0, CARD[0], CARD[1]);
  return { c, x };
}

/** A strip card: frames spread through the burn, stacked top to bottom on a dark print. */
function stripCard(sheet: HTMLImageElement, s: Strip, offset: number) {
  const { c, x } = canvas();
  const [tw, th] = s.tile, pad = 26, gap = 6;
  const w = CARD[0] - pad * 2, h = (th * w) / tw;
  const top = (CARD[1] - (ROWS * h + (ROWS - 1) * gap)) / 2;
  for (let k = 0; k < ROWS; k++) {
    const t = SPAN[0] + (SPAN[1] - SPAN[0]) * ((k + offset) / ROWS);
    const i = Math.min(s.frames - 1, Math.max(0, Math.round(t * (s.frames - 1))));
    const sx = (i % s.cols) * tw, sy = Math.floor(i / s.cols) * th;
    x.drawImage(sheet, sx, sy, tw, th, pad, top + k * (h + gap), w, h);
  }
  return c;
}

/** A photo card: the raw photo cropped to the card's shape, centred a little left of middle where the flame sits. */
function photoCard(img: HTMLImageElement) {
  const { c, x } = canvas();
  const s = Math.max(CARD[0] / img.naturalWidth, CARD[1] / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  const left = Math.min(0, Math.max(CARD[0] - w, CARD[0] / 2 - w * 0.4));
  x.drawImage(img, left, (CARD[1] - h) / 2, w, h);
  return c;
}

/** Every card face, strip cards and photo cards interleaved so neighbours differ. */
export async function makeBurnCards(): Promise<HTMLCanvasElement[]> {
  const strips = frames.strips as Record<string, Strip>;
  const tests = Object.keys(strips);
  const [sheets, photos] = await Promise.all([
    Promise.all(tests.map((t) => load(`/frames/${t}/sheet.jpg`))),
    Promise.all(frames.pairs.photos.map((p) => load(p.raw))),
  ]);
  const a: HTMLCanvasElement[] = [], b: HTMLCanvasElement[] = [];
  tests.forEach((t, i) => { const img = sheets[i]; if (img) a.push(stripCard(img, strips[t], i % 2 ? 0.5 : 0)); });
  photos.forEach((img) => { if (img) b.push(photoCard(img)); });
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < Math.max(a.length, b.length * 2); i++) {
    if (a[i]) out.push(a[i]);
    if (i % 2 === 1 && b[(i - 1) / 2]) out.push(b[(i - 1) / 2]);
  }
  for (const p of b) if (!out.includes(p)) out.push(p);
  return out;
}
export const CARD_SIZE = CARD;
