import type { LlmClient } from "./enrich.js";

export interface FetchResult {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<FetchResult>;

export const defaultFetch: FetchFn = async (url, init) => {
  const res = await fetch(url, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body,
  });
  return { ok: res.ok, status: res.status, json: () => res.json() };
};

const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

export class GeminiClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = defaultFetch,
  ) {}

  async complete(prompt: string): Promise<string> {
    const url = `${ENDPOINT}?key=${this.apiKey}`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) throw new Error(`gemini: HTTP ${res.status}`);
    const data = (await res.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") throw new Error("gemini: no candidate text");
    return text;
  }
}

export function makeLlmClientFromEnv(fetchFn: FetchFn = defaultFetch): LlmClient | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GeminiClient(key, fetchFn);
}
