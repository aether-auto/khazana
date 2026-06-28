// Headless verification of ReadPlayer via playwright-core + system Chrome.
// Loads the dev harness in dark+light × normal+reduced-motion, exercises every
// control (play, scrub, speed, voice switch, paragraph click-to-seek), asserts
// zero console errors / pageerrors, and screenshots the deck in dark + light.
//
// Astro excludes `_`-prefixed pages from the build, so to verify the production
// bundle: copy src/pages/_dev/read-player.astro to a non-underscore page (fix the
// `../../` imports to `../`), `astro build`, serve dist statically on :4331, then
// `node scripts/verify-read-player.mjs`. Remove the temp page afterwards.
// playwright-core is a workspace-root devDep, isolated in pnpm's store and not
// symlinked into apps/site/node_modules — resolve it from the store directly.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(
  "/Users/arnavmarda/Desktop/Dev/khazana/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.js",
);

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:4331/dev-read-player";
const SHOT = "/tmp/khz-shot";

const matrix = [
  { name: "dark-normal", colorScheme: "dark", reducedMotion: "no-preference", shot: true },
  { name: "light-normal", colorScheme: "light", reducedMotion: "no-preference", shot: true },
  { name: "dark-reduced", colorScheme: "dark", reducedMotion: "reduce", shot: false },
  { name: "light-reduced", colorScheme: "light", reducedMotion: "reduce", shot: false },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let totalErrors = 0;

for (const cfg of matrix) {
  const ctx = await browser.newContext({
    colorScheme: cfg.colorScheme,
    reducedMotion: cfg.reducedMotion,
    viewport: { width: 1100, height: 900 },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  // `networkidle` never settles — <audio preload> holds a connection. Use DOM
  // ready + an explicit wait for the hydrated control instead.
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button[aria-label="Play narration"]', { timeout: 10000 });

  // PLAY → assert it flips to a pause control + audio is progressing
  await page.click('button[aria-label="Play narration"]');
  await page.waitForTimeout(900);
  const isPlaying = await page.evaluate(() => {
    const a = document.querySelector("audio");
    return !!a && !a.paused && a.currentTime > 0;
  });
  if (!isPlaying) errors.push("audio did not start playing");

  // SCRUB via keyboard on the slider (deterministic, no pixel math)
  await page.focus('[role="slider"][aria-label="Seek"]');
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);

  // SPEED → 1.5×, assert playbackRate + preservesPitch
  await page.click('button[aria-pressed]:has-text("1.5")');
  await page.waitForTimeout(120);
  const rateOk = await page.evaluate(() => {
    const a = document.querySelector("audio");
    return !!a && Math.abs(a.playbackRate - 1.5) < 1e-6 && a.preservesPitch === true;
  });
  if (!rateOk) errors.push("playbackRate/preservesPitch not applied");

  // NARRATOR LABEL → one voice per piece, shown as a static label, no switcher
  const narratorOk = await page.evaluate(() => {
    // there must be NO voice-picker dropdown trigger anywhere
    const noPicker = document.querySelector('button[aria-haspopup="listbox"]') === null;
    // the visible voice name + the "Narrated by …" accessible name must be present
    const eyebrow = document.querySelector('[aria-roledescription="audio player"] [aria-label^="Narrated by"]');
    const visible = /Fable/.test(eyebrow?.textContent ?? "");
    const a11y = /narrated by/i.test(eyebrow?.getAttribute("aria-label") ?? "");
    return noPicker && visible && a11y;
  });
  if (!narratorOk) errors.push("narrator label missing or a voice picker is still present");

  // PARAGRAPH click-to-seek → click para 3, assert highlight + seek
  await page.click('[data-para-index="3"]');
  await page.waitForTimeout(300);
  const paraOk = await page.evaluate(() => {
    const el = document.querySelector('[data-para-index="3"]');
    const a = document.querySelector("audio");
    return !!el && el.classList.contains("is-narrating") && !!a && a.currentTime >= 13.5;
  });
  if (!paraOk) errors.push("paragraph click-to-seek did not seek + highlight");

  // VOLUME / MUTE toggle
  await page.click('button[aria-label="Mute"]');
  await page.waitForTimeout(80);
  const mutedOk = await page.evaluate(() => document.querySelector("audio")?.muted === true);
  if (!mutedOk) errors.push("mute did not mute the element");
  await page.click('button[aria-label="Unmute"]');

  if (cfg.shot) {
    await page.click('button[aria-label="Play narration"]').catch(() => {});
    await page.waitForTimeout(200);
    const deck = page.locator("section[aria-roledescription='audio player']");
    await deck.screenshot({ path: `${SHOT}/readplayer-${cfg.name}.png` });
    // full page too, to show prose highlight context
    await page.screenshot({ path: `${SHOT}/readplayer-${cfg.name}-full.png` });
  }

  console.log(`[${cfg.name}] errors: ${errors.length}`);
  for (const e of errors) console.log(`   - ${e}`);
  totalErrors += errors.length;
  await ctx.close();
}

await browser.close();
console.log(`\nTOTAL ERRORS: ${totalErrors}`);
process.exit(totalErrors === 0 ? 0 : 1);
