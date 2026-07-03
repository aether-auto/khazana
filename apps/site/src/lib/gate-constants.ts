/**
 * Site-gate crypto constants — the SINGLE SOURCE OF TRUTH shared by the
 * client-side unlock gate (`SiteGate.astro`) and the hash-generator script
 * (`scripts/site-gate-hash.mts`). If these ever drift, a hash minted by the
 * script will never match what the browser derives, and the site is unlockable
 * by no password at all — so they MUST stay identical. Keeping them in one
 * imported module is how they never drift.
 *
 * Verification is PBKDF2-SHA256(password, SALT, ITERATIONS) → DKLEN bytes,
 * lowercase-hex encoded. The client compares that hex, in constant-time-ish
 * fashion, against `import.meta.env.PUBLIC_SITE_GATE_HASH` (baked at build).
 *
 * Residual limitation (by design): this gates the *rendered experience* of a
 * pre-rendered static site. The HTML bytes still exist in view-source / the
 * dist folder; this is a considered access curtain for a personal site, not a
 * server-enforced authorization boundary. Never put a real secret behind it.
 */

/** Fixed salt. Not secret — it only needs to be stable across client + script. */
export const GATE_SALT = "khazana::site-gate::v1";

/** PBKDF2 iteration count. High enough to make offline guessing slow. */
export const GATE_ITERATIONS = 150_000;

/** Derived-key length in BITS (32 bytes → 256-bit → 64 hex chars). */
export const GATE_DKLEN_BITS = 256;

/** localStorage key holding the unlock flag. Versioned so we can invalidate. */
export const GATE_STORAGE_KEY = "khz-gate-v1";

/** Value written to localStorage once unlocked. */
export const GATE_UNLOCK_VALUE = "1";

/** Env var (baked at build) holding the expected lowercase-hex PBKDF2 digest. */
export const GATE_ENV_KEY = "PUBLIC_SITE_GATE_HASH";
