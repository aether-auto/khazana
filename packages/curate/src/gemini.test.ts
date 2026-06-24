import { afterEach, beforeEach, expect, test } from "vitest";
import { GeminiClient, makeLlmClientFromEnv, type FetchFn, type FetchResult } from "./gemini.js";

const okJson = (value: unknown): FetchResult => ({
  ok: true,
  status: 200,
  json: async () => value,
});

test("GeminiClient.complete posts the correct URL + body and reads the response text", async () => {
  let sentUrl = "";
  let sentBody: unknown;
  let sentMethod: string | undefined;
  const fetchFn: FetchFn = async (url, init) => {
    sentUrl = url;
    sentMethod = init?.method;
    sentBody = init?.body ? JSON.parse(init.body) : undefined;
    return okJson({
      candidates: [{ content: { parts: [{ text: '{"topics":["ai"]}' }] } }],
    });
  };
  const client = new GeminiClient("KEY123", fetchFn);
  const text = await client.complete("hello prompt");

  expect(sentUrl).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=KEY123",
  );
  expect(sentMethod).toBe("POST");
  expect(sentBody).toEqual({ contents: [{ parts: [{ text: "hello prompt" }] }] });
  expect(text).toBe('{"topics":["ai"]}');
});

test("GeminiClient.complete throws on non-OK HTTP", async () => {
  const fetchFn: FetchFn = async () => ({ ok: false, status: 429, json: async () => ({}) });
  await expect(new GeminiClient("K", fetchFn).complete("p")).rejects.toThrow("429");
});

test("GeminiClient.complete throws when the response has no candidate text", async () => {
  const fetchFn: FetchFn = async () => okJson({ candidates: [] });
  await expect(new GeminiClient("K", fetchFn).complete("p")).rejects.toThrow();
});

describe_env();
function describe_env(): void {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.GEMINI_API_KEY;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  });

  test("makeLlmClientFromEnv returns null when GEMINI_API_KEY is unset", () => {
    delete process.env.GEMINI_API_KEY;
    expect(makeLlmClientFromEnv()).toBeNull();
  });

  test("makeLlmClientFromEnv returns a client when the key is set", () => {
    process.env.GEMINI_API_KEY = "abc";
    const client = makeLlmClientFromEnv(async () => okJson({}));
    expect(client).not.toBeNull();
    expect(client).toBeInstanceOf(GeminiClient);
  });
}
