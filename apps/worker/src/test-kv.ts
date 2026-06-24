import type { KVLike } from "./env.js";

export interface FakeKV extends KVLike {
  store: Map<string, string>;
}

export function createFakeKV(seed: Record<string, string> = {}): FakeKV {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    get(key: string): Promise<string | null> {
      return Promise.resolve(store.has(key) ? (store.get(key) as string) : null);
    },
    put(key: string, value: string): Promise<void> {
      store.set(key, value);
      return Promise.resolve();
    },
    list(opts: { prefix: string }): Promise<{ keys: { name: string }[] }> {
      const names = [...store.keys()]
        .filter((name) => name.startsWith(opts.prefix))
        .sort();
      return Promise.resolve({ keys: names.map((name) => ({ name })) });
    },
  };
}
