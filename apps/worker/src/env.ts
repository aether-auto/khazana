export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(opts: { prefix: string }): Promise<{ keys: { name: string }[] }>;
}

export interface Env {
  KV: KVLike;
  EXPORT_TOKEN?: string;
  ALLOWED_ORIGIN?: string;
  WORLD_INGEST_TOKEN?: string;
}
