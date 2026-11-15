// Written with AI assistance (Claude Code)
// Meaning search for /api/ask: turns the question into a gemini-embedding-001 vector, so
// api/_retrieve.ts can find passages that say the same thing in other words ("investigated" vs
// "tests"). The passages' vectors are made once, at build time (scripts/build-ask-index.mjs, stored
// in scripts/ask-index/vectors.json). If this call fails or is slow, the endpoint falls back to
// keyword search, so it is never worse than without it.
// This file starts with "_", so Vercel does not deploy it as an endpoint.
import { ApiError, type GoogleGenAI } from "@google/genai";

/** Must match scripts/build-ask-index.mjs, which embeds the passages. */
export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIMS = 768;
/**
 * The embedding call gets this long; the answer gets the rest of the request's time. Measured
 * 2026-11-15: 120 to 500 ms (the slowest was the first call, with the connection set-up). A stalled call
 * costs at most this much before keyword search answers alone.
 */
export const EMBED_TIMEOUT_MS = 1500;

/** A stored int8 vector (base64) and its length, ready for cosine similarity. */
export interface StoredVector {
  values: Int8Array;
  norm: number;
}

export function decodeVector(base64: string): StoredVector | null {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length !== EMBED_DIMS) return null;
  const values = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
  let sum = 0;
  for (const v of values) sum += v * v;
  return sum > 0 ? { values, norm: Math.sqrt(sum) } : null;
}

/** Cosine similarity of a query vector and a stored vector, from -1 to 1. */
export function cosine(query: Float32Array, stored: StoredVector): number {
  let dot = 0;
  let qq = 0;
  for (let i = 0; i < EMBED_DIMS; i++) {
    dot += query[i] * stored.values[i];
    qq += query[i] * query[i];
  }
  return qq > 0 ? dot / (Math.sqrt(qq) * stored.norm) : 0;
}

/** The question's embedding, or null if the call fails, times out or returns something unusable. */
export async function embedQuery(client: GoogleGenAI, text: string, timeoutMs = EMBED_TIMEOUT_MS): Promise<Float32Array | null> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const expired = new Promise<null>((resolve) => deadline.signal.addEventListener("abort", () => resolve(null), { once: true }));
  try {
    const call = client.models.embedContent({
      model: EMBED_MODEL,
      contents: text,
      config: { taskType: "RETRIEVAL_QUERY", outputDimensionality: EMBED_DIMS, abortSignal: deadline.signal },
    });
    call.catch(() => {}); // it may settle after the deadline
    const response = await Promise.race([call, expired]);
    if (response === null) {
      console.warn("[api/ask] embedding timed out; keyword search only");
      return null;
    }
    const values = response.embeddings?.[0]?.values;
    if (!Array.isArray(values) || values.length !== EMBED_DIMS || !values.every((v) => Number.isFinite(v))) {
      console.warn("[api/ask] embedding reply unusable; keyword search only");
      return null;
    }
    return Float32Array.from(values);
  } catch (e) {
    // The status or the error's name only: a message can quote the request.
    console.warn("[api/ask] embedding failed; keyword search only:", e instanceof ApiError ? e.status : e instanceof Error ? e.name : typeof e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
