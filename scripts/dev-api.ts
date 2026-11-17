// Written with AI assistance (Claude Code)
// Local API server for development: serves the same handlers Vercel runs (api/ask.ts, api/health.ts,
// api/psi.ts) on http://localhost:3000, which is where web/vite.config.ts proxies /api. Without it a
// local copy of the site (npm run dev, or vite preview) has pages but no Ask: every question fails.
//
//   npm run dev:api        (reads GEMINI_API_KEY from your environment; never pass it on the command line)
//
// Then open the site with `npm run dev` (or `npx vite preview` in web/) and Ask works locally.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { POST as ask } from "../api/ask.js";
import { GET as health } from "../api/health.js";
import { GET as psi } from "../api/psi.js";

const PORT = Number(process.env.DEV_API_PORT ?? 3000);

type Handler = (request: Request) => Promise<Response> | Response;
const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  "/api/ask": { POST: ask },
  "/api/health": { GET: () => health() },
  "/api/psi": { GET: psi },
};

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const route = ROUTES[url.pathname];
  const method = req.method ?? "GET";
  const handler = route?.[method];
  if (!route) return void res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: { code: "not_found", message: url.pathname } }));
  if (!handler) return void res.writeHead(405, { allow: Object.keys(route).join(", ") }).end();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
  const t0 = Date.now();
  const out = await handler(new Request(url, { method, headers, body }));
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
  console.log(`${method} ${url.pathname} -> ${out.status} (${Date.now() - t0} ms)`);
}

createServer((req, res) => {
  serve(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "dev_api_error", message: String(e) } }));
  });
}).listen(PORT, () => {
  const key = process.env.GEMINI_API_KEY?.trim() ? "set" : "NOT set (Ask will answer 503 not_configured; set it in your environment)";
  console.log(`dev API on http://localhost:${PORT} (/api/ask, /api/health, /api/psi). GEMINI_API_KEY: ${key}`);
});
