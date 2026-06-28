/**
 * The narration cast — the voices the Read audio player offers — plus the
 * channel→voice policy.
 *
 * Each Read is narrated by EXACTLY ONE voice, chosen by its channel(s):
 *   - Story/narrative channels (history, geopolitics, politics, geography) get
 *     `bm_fable`, a British storyteller voice.
 *   - Everything else gets `am_onyx`, a deep American voice with gravitas — the
 *     default for analytical/technical pieces.
 *
 * `voiceForChannels()` implements that mapping; the render pipeline calls it once
 * per Read to pick the single track to synthesize.
 */

/** A single selectable narrator. */
export interface NarrationVoice {
  /** Kokoro voice ID passed to `tts.generate({ voice })`. */
  voice: string;
  /** Short display name for the picker. */
  label: string;
  /** One-line description of the delivery. */
  blurb: string;
}

/**
 * The two-voice cast. `bm_fable` for narrative/story pieces, `am_onyx` for
 * everything else (the default).
 */
export const NARRATION_VOICES: NarrationVoice[] = [
  {
    voice: "bm_fable",
    label: "Fable",
    blurb: "British storyteller — warm narrator",
  },
  {
    voice: "am_onyx",
    label: "Onyx",
    blurb: "deep American — gravitas",
  },
];

/** The voice used as the default and for any non-story / unknown channel set. */
export const DEFAULT_VOICE = "am_onyx";

/** Voice used for narrative/story channels. */
export const STORY_VOICE = "bm_fable";

/**
 * Channels whose pieces read like stories and get the storyteller voice. Members
 * are drawn from the core CHANNELS vocab. Any other channel uses DEFAULT_VOICE.
 */
export const STORY_CHANNELS: ReadonlySet<string> = new Set([
  "history",
  "geopolitics",
  "politics",
  "geography",
]);

/**
 * Pick the single narration voice for a Read from its channel list.
 *
 * If ANY channel is a story channel → `bm_fable` (the narrative wins; a piece
 * that is partly history is told like a story). Otherwise — including an empty or
 * all-unknown channel list → `am_onyx` (the default).
 */
export function voiceForChannels(channels: ReadonlyArray<string>): string {
  for (const ch of channels) {
    if (STORY_CHANNELS.has(ch)) return STORY_VOICE;
  }
  return DEFAULT_VOICE;
}

/** Look up a cast entry by Kokoro voice ID, or undefined if it isn't in the cast. */
export function findVoice(voice: string): NarrationVoice | undefined {
  return NARRATION_VOICES.find((v) => v.voice === voice);
}
