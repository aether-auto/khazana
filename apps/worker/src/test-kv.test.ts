import { expect, test } from "vitest";
import { createFakeKV } from "./test-kv.js";

test("put then get round-trips a value", async () => {
  const kv = createFakeKV();
  await kv.put("evt:anon:1", "hello");
  expect(await kv.get("evt:anon:1")).toBe("hello");
  expect(kv.store.get("evt:anon:1")).toBe("hello");
});

test("get returns null for a missing key", async () => {
  const kv = createFakeKV();
  expect(await kv.get("nope")).toBeNull();
});

test("list filters by prefix and returns sorted key names", async () => {
  const kv = createFakeKV({
    "evt:a:2": "2",
    "evt:a:1": "1",
    "other:x": "x",
  });
  const { keys } = await kv.list({ prefix: "evt:" });
  expect(keys.map((k) => k.name)).toEqual(["evt:a:1", "evt:a:2"]);
});
