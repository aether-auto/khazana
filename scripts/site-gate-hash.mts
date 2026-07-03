#!/usr/bin/env -S pnpm tsx
/**
 * site-gate-hash — compute the PBKDF2-SHA256 digest for the site access gate.
 *
 * Usage:
 *   pnpm tsx scripts/site-gate-hash.mts <password>
 *   echo -n '<password>' | pnpm tsx scripts/site-gate-hash.mts     # from stdin
 *
 * Prints a copy-paste line:
 *   PUBLIC_SITE_GATE_HASH=<64-char-lowercase-hex>
 *
 * Set that value as a GitHub Actions *variable* (it's PUBLIC_ / baked at build
 * time, not a secret) and the next build gates the site. Leaving it unset makes
 * the gate absent — the site behaves exactly as today.
 *
 * The salt + iteration count + encoding are imported from the SAME module the
 * browser gate uses (`apps/site/src/lib/gate-constants.ts`) so the value this
 * prints is byte-identical to what the client derives. They can never drift.
 */
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  GATE_SALT,
  GATE_ITERATIONS,
  GATE_DKLEN_BITS,
} from "../apps/site/src/lib/gate-constants.ts";

/** Read the password from argv[0] or, failing that, from stdin. */
async function resolvePassword(): Promise<string> {
  const arg = process.argv[2];
  if (typeof arg === "string" && arg.length > 0) return arg;

  // No arg → read stdin (allows `echo -n secret | ...` without leaking to `ps`).
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  // Trim ONE trailing newline (from `echo`) but preserve everything else.
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

/** PBKDF2-SHA256 → lowercase hex. Mirrors SiteGate's crypto.subtle.deriveBits. */
async function derive(password: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await webcrypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await webcrypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(GATE_SALT),
      iterations: GATE_ITERATIONS,
    },
    keyMaterial,
    GATE_DKLEN_BITS,
  );
  return [...new Uint8Array(bits)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function main(): Promise<void> {
  const password = await resolvePassword();
  if (!password) {
    process.stderr.write(
      "site-gate-hash: no password provided.\n" +
        "  pnpm tsx scripts/site-gate-hash.mts <password>\n" +
        "  echo -n '<password>' | pnpm tsx scripts/site-gate-hash.mts\n",
    );
    process.exit(1);
  }
  const hex = await derive(password);
  // The one copy-paste line the caller wants.
  process.stdout.write(`PUBLIC_SITE_GATE_HASH=${hex}\n`);
}

// Only run when invoked directly (not if ever imported).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`site-gate-hash: ${String(err)}\n`);
    process.exit(1);
  });
}
