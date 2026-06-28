// Dev-only: synthesize short, distinct PCM-WAV tones as placeholder narration so
// the ReadPlayer can actually PLAY / scrub / switch voices in a browser without a
// real TTS pipeline. Three "voices" at different base pitches, ~24s each, with a
// gentle amplitude swell so the waveform/scrub feels alive. Run with `node`.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../public/audio/_dev");
mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 22050;

/** Write a mono 16-bit PCM WAV of `seconds` built from `sampleFn(t)` in [-1,1]. */
function writeWav(name, seconds, sampleFn) {
  const n = Math.floor(SAMPLE_RATE * seconds);
  const bytesPerSample = 2;
  const dataSize = n * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);
  // RIFF header
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // byte rate
  buf.writeUInt16LE(bytesPerSample, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const v = Math.max(-1, Math.min(1, sampleFn(t)));
    buf.writeInt16LE(Math.round(v * 0.3 * 32767), 44 + i * bytesPerSample);
  }
  writeFileSync(resolve(outDir, name), buf);
  console.log(`wrote ${name} (${seconds}s)`);
}

// A soft, breathing tone: a base sine + a fifth, with a slow 0.25Hz tremolo so
// it reads as "narration cadence" rather than a flat test tone.
const voiceTone = (base) => (t) => {
  const swell = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.25 * t);
  const vibrato = 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t);
  return (
    swell *
    (0.7 * Math.sin(2 * Math.PI * base * vibrato * t) +
      0.3 * Math.sin(2 * Math.PI * base * 1.5 * t))
  );
};

const DURATION = 24;
writeWav("fable.wav", DURATION, voiceTone(196)); // G3 — storyteller
writeWav("onyx.wav", DURATION, voiceTone(146.83)); // D3 — gravitas (lower)
writeWav("heart.wav", DURATION, voiceTone(261.63)); // C4 — warm (higher)
