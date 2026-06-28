// READPLAYER — the narration deck for a Read.
//
// A compact, on-brand audio player for dramatically-narrated long-form reads.
// Terminal × editorial: mono chrome, amber = the playing signal, clay = the
// secondary accent, hairline rules, lines-not-boxes. One <audio> element drives
// everything; the React state mirrors it. All media + storage side-effects live
// here — the time/lookup math is pure in ./lib/narration.
//
// One narrator per piece (the pipeline renders a single channel-selected voice),
// so the narrator is shown as a static "narrated by …" label — there is no voice
// switcher. Controls (all keyboard + ARIA): play/pause · draggable seek with
// buffered indicator + mono readouts · speed (preservesPitch, no chipmunk) ·
// volume + mute · paragraph-synced highlight that drives [data-para-index]
// elements in the prose, with click-a-paragraph-to-seek.
//
// SSR-safe: window / localStorage / document touches are guarded to effects so
// the server markup and first client render agree. Honors prefers-reduced-motion
// (the highlight becomes an instant state change; transitions strip out).
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  activeParagraphIndex,
  coerceRate,
  coerceVolume,
  formatClock,
  progressFraction,
  seekTimeFromFraction,
  sortMarks,
  PLAYBACK_RATES,
  type PlaybackRate,
  type ParagraphMark,
} from "./lib/narration.js";
import styles from "./ReadPlayer.module.css";

export interface NarrationTrack {
  voice: string;
  label: string;
  src: string;
  durationSec: number;
}

export type { ParagraphMark } from "./lib/narration.js";

export interface ReadPlayerProps {
  /** The pre-rendered narration. The pipeline renders ONE channel-selected
   *  narrator per piece, so this carries exactly one entry — `tracks[0]` — shown
   *  as a static "narrated by …" label. (Kept as an array so the manifest shape
   *  is future-proof; the player does not switch tracks.) */
  tracks: NarrationTrack[];
  /** Start time of each prose paragraph, for the active-highlight + seek. */
  paragraphs: ParagraphMark[];
  title?: string;
}

// localStorage keys — namespaced, shared across every Read so the chosen speed /
// volume carries between articles. Fail-soft: a throwing storage (private mode,
// disabled cookies) degrades to in-memory only.
const LS_SPEED = "khazana:narration:speed";
const LS_VOLUME = "khazana:narration:volume";
const LS_MUTED = "khazana:narration:muted";

// The CustomEvent the player dispatches on the active paragraph changing, for any
// listener that would rather react to events than the DOM class we also apply.
const PARA_EVENT = "khz:narration-para";

function readLS(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
    /* fail-soft: storage unavailable */
  }
}

/** Set playbackRate + every preservesPitch vendor flag so speed changes don't
 *  chipmunk the narration. The vendor props aren't in lib.dom, so we reach them
 *  through a narrow cast rather than `any`. */
function applyRate(el: HTMLAudioElement, rate: number): void {
  const pitch = el as HTMLAudioElement & {
    preservesPitch?: boolean;
    mozPreservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
  };
  pitch.preservesPitch = true;
  pitch.mozPreservesPitch = true;
  pitch.webkitPreservesPitch = true;
  el.playbackRate = rate;
}

export default function ReadPlayer({ tracks, paragraphs, title }: ReadPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const labelId = useId();

  // Marks are sorted + de-duped once; the binary-search lookup assumes order.
  const marks = useMemo<ParagraphMark[]>(() => sortMarks(paragraphs), [paragraphs]);
  const hasParagraphs = marks.length > 0;

  // One narrator per piece — the single rendered track.
  const track = tracks[0];

  // ── transport + pref state (deterministic SSR defaults; prefs hydrate in an
  //    effect after mount so server + first client render agree) ───────────────
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(track?.durationSec ?? 0);
  const [buffered, setBuffered] = useState(0);
  const [rate, setRate] = useState<PlaybackRate>(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [activePara, setActivePara] = useState<number | null>(null);
  // Track whether the user is mid-scrub, so timeupdate doesn't fight the drag.
  const [scrubbing, setScrubbing] = useState(false);

  // ── hydrate persisted prefs once, after mount ───────────────────────────────
  useEffect(() => {
    setRate(coerceRate(readLS(LS_SPEED) ?? undefined));
    setVolume(coerceVolume(readLS(LS_VOLUME) ?? undefined));
    setMuted(readLS(LS_MUTED) === "1");
  }, []);

  // ── push prefs into the media element + persist them ────────────────────────
  useEffect(() => {
    const el = audioRef.current;
    if (el) applyRate(el, rate);
    writeLS(LS_SPEED, String(rate));
  }, [rate]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = volume;
    writeLS(LS_VOLUME, String(volume));
  }, [volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.muted = muted;
    writeLS(LS_MUTED, muted ? "1" : "0");
  }, [muted]);

  // ── active-paragraph highlight: apply `is-narrating` to [data-para-index]
  //    elements in the prose + dispatch a CustomEvent. No-op without paragraphs.
  useEffect(() => {
    if (!hasParagraphs || typeof document === "undefined") return;
    const prev = document.querySelector<HTMLElement>("[data-para-index].is-narrating");
    if (prev && prev.dataset.paraIndex !== String(activePara)) {
      prev.classList.remove("is-narrating");
      prev.removeAttribute("aria-current");
    }
    if (activePara != null) {
      const next = document.querySelector<HTMLElement>(`[data-para-index="${activePara}"]`);
      if (next && !next.classList.contains("is-narrating")) {
        next.classList.add("is-narrating");
        next.setAttribute("aria-current", "true");
      }
      document.dispatchEvent(
        new CustomEvent<{ index: number }>(PARA_EVENT, { detail: { index: activePara } }),
      );
    }
  }, [activePara, hasParagraphs]);

  // Clear the highlight on unmount so a navigated-away prose doesn't keep it.
  useEffect(() => {
    return () => {
      if (typeof document === "undefined") return;
      document
        .querySelectorAll<HTMLElement>("[data-para-index].is-narrating")
        .forEach((el) => {
          el.classList.remove("is-narrating");
          el.removeAttribute("aria-current");
        });
    };
  }, []);

  // ── seek-to-paragraph: click any [data-para-index] in the prose → seek there.
  useEffect(() => {
    if (!hasParagraphs || typeof document === "undefined") return;
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-para-index]");
      if (!target) return;
      // Don't hijack clicks on links/buttons inside the paragraph.
      if ((e.target as HTMLElement | null)?.closest("a, button")) return;
      const idx = Number(target.dataset.paraIndex);
      const mark = marks.find((m) => m.index === idx);
      const el = audioRef.current;
      if (!mark || !el) return;
      el.currentTime = mark.startSec;
      setCurrent(mark.startSec);
      void el.play().catch(() => {});
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [hasParagraphs, marks]);

  // ── media element event wiring ───────────────────────────────────────────────
  const onTimeUpdate = useCallback(() => {
    const el = audioRef.current;
    if (!el || scrubbing) return;
    setCurrent(el.currentTime);
    if (hasParagraphs) setActivePara(activeParagraphIndex(marks, el.currentTime));
  }, [scrubbing, hasParagraphs, marks]);

  const onLoadedMeta = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    // Prefer the real media duration; fall back to the manifest value (it lets
    // the readout render correct before metadata, and covers streamed sources
    // that report Infinity until fully buffered).
    setDuration(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : track?.durationSec ?? 0);
    applyRate(el, rate);
    el.volume = volume;
    el.muted = muted;
  }, [rate, volume, muted, track?.durationSec]);

  const onProgress = useCallback(() => {
    const el = audioRef.current;
    if (!el || el.buffered.length === 0) return;
    setBuffered(el.buffered.end(el.buffered.length - 1));
  }, []);

  // ── play / pause ─────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setPlaying(false));
    else el.pause();
  }, []);

  // ── scrub bar: pointer drag + click-to-seek, keyboard arrows ────────────────
  const railRef = useRef<HTMLDivElement | null>(null);
  const fractionFromPointer = useCallback((clientX: number): number => {
    const rail = railRef.current;
    if (!rail) return 0;
    const r = rail.getBoundingClientRect();
    return r.width > 0 ? (clientX - r.left) / r.width : 0;
  }, []);

  const seekTo = useCallback(
    (sec: number) => {
      const el = audioRef.current;
      const clamped = Math.min(duration || 0, Math.max(0, sec));
      setCurrent(clamped);
      if (hasParagraphs) setActivePara(activeParagraphIndex(marks, clamped));
      if (el) el.currentTime = clamped;
    },
    [duration, hasParagraphs, marks],
  );

  const onRailPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setScrubbing(true);
      const f = fractionFromPointer(e.clientX);
      setCurrent(seekTimeFromFraction(f, duration));
    },
    [duration, fractionFromPointer],
  );
  const onRailPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      const f = fractionFromPointer(e.clientX);
      setCurrent(seekTimeFromFraction(f, duration));
    },
    [scrubbing, duration, fractionFromPointer],
  );
  const onRailPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      const f = fractionFromPointer(e.clientX);
      seekTo(seekTimeFromFraction(f, duration));
      setScrubbing(false);
    },
    [scrubbing, duration, fractionFromPointer, seekTo],
  );

  const onRailKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 30 : 5;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        seekTo(current + step);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekTo(current - step);
      } else if (e.key === "Home") {
        e.preventDefault();
        seekTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        seekTo(duration);
      }
    },
    [current, duration, seekTo],
  );

  const fraction = progressFraction(current, duration);
  const bufferedFraction = progressFraction(buffered, duration);

  // ── volume slider ────────────────────────────────────────────────────────────
  const onVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = coerceVolume(Number(e.target.value));
    setVolume(v);
    if (v > 0) setMuted(false);
  }, []);
  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const effectiveMuted = muted || volume === 0;
  const volumePct = Math.round((effectiveMuted ? 0 : volume) * 100);

  return (
    <section
      className={styles.player}
      aria-label={title ? `Narration — ${title}` : "Narration"}
      aria-roledescription="audio player"
    >
      {/* the one media element everything mirrors */}
      <audio
        ref={audioRef}
        src={track?.src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMeta}
        onDurationChange={onLoadedMeta}
        onProgress={onProgress}
      />

      <div className={styles.deck}>
        {/* PLAY / PAUSE — the satisfying primary */}
        <button
          type="button"
          className={styles.play}
          onClick={togglePlay}
          aria-label={playing ? "Pause narration" : "Play narration"}
          aria-pressed={playing}
          data-playing={playing || undefined}
        >
          <span className={styles.playGlyph} aria-hidden="true">
            {playing ? (
              <svg viewBox="0 0 24 24" width="20" height="20">
                <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path d="M7 5.5 19 12 7 18.5z" fill="currentColor" />
              </svg>
            )}
          </span>
          {/* the listening pulse — three bars that breathe while playing */}
          <span className={styles.pulse} aria-hidden="true" data-on={playing || undefined}>
            <i /><i /><i />
          </span>
        </button>

        {/* TITLE + TRANSPORT */}
        <div className={styles.body}>
          <div className={styles.meta}>
            {/* narrator identity — compact: the clay glyph + the voice name.
                The full "Narrated by <label>" reads in the a11y name + tooltip. */}
            <span
              className={styles.eyebrow}
              id={labelId}
              title={track ? `Narrated by ${track.label}` : undefined}
              aria-label={track ? `Narrated by ${track.label}` : "narration"}
            >
              {track ? (
                <>
                  <span className={styles.voiceGlyph} aria-hidden="true">◈</span>
                  <span className={styles.voiceTag}>{track.voice}</span>
                </>
              ) : (
                "narration"
              )}
            </span>
            <span className={styles.time}>
              <span className={styles.timeCur}>{formatClock(current)}</span>
              <span className={styles.timeSep} aria-hidden="true">/</span>
              <span className={styles.timeDur}>{formatClock(duration)}</span>
            </span>
          </div>

          {/* SEEK — draggable, click-to-seek, buffered indicator, para ticks */}
          <div
            ref={railRef}
            className={styles.rail}
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.max(1, Math.round(duration))}
            aria-valuenow={Math.round(current)}
            aria-valuetext={`${formatClock(current)} of ${formatClock(duration)}`}
            aria-describedby={labelId}
            data-scrubbing={scrubbing || undefined}
            onPointerDown={onRailPointerDown}
            onPointerMove={onRailPointerMove}
            onPointerUp={onRailPointerUp}
            onPointerCancel={onRailPointerUp}
            onKeyDown={onRailKey}
          >
            <span className={styles.railTrack} aria-hidden="true" />
            <span
              className={styles.railBuffered}
              aria-hidden="true"
              style={{ transform: `scaleX(${bufferedFraction})` }}
            />
            <span
              className={styles.railFill}
              aria-hidden="true"
              style={{ transform: `scaleX(${fraction})` }}
            />
            {/* paragraph ticks — the structure of the read, made visible */}
            {hasParagraphs && duration > 0 ? (
              <span className={styles.ticks} aria-hidden="true">
                {marks.map((m) =>
                  m.startSec > 0 && m.startSec < duration ? (
                    <i
                      key={m.index}
                      className={styles.tick}
                      style={{ left: `${(m.startSec / duration) * 100}%` }}
                      data-active={activePara === m.index || undefined}
                    />
                  ) : null,
                )}
              </span>
            ) : null}
            <span
              className={styles.thumb}
              aria-hidden="true"
              style={{ left: `${fraction * 100}%` }}
            />
          </div>
        </div>

        {/* RIGHT CLUSTER — speed · volume */}
        <div className={styles.tools}>
          {/* SPEED */}
          <div className={styles.speed} role="group" aria-label="Playback speed">
            <span className={styles.toolLabel} aria-hidden="true">spd</span>
            <div className={styles.segmented}>
              {PLAYBACK_RATES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={styles.seg}
                  data-active={rate === r || undefined}
                  aria-pressed={rate === r}
                  onClick={() => setRate(r)}
                >
                  {r}
                  <span className={styles.segx} aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          </div>

          {/* VOLUME */}
          <div className={styles.volume} role="group" aria-label="Volume">
            <button
              type="button"
              className={styles.mute}
              onClick={toggleMute}
              aria-label={effectiveMuted ? "Unmute" : "Mute"}
              aria-pressed={effectiveMuted}
            >
              <span aria-hidden="true">
                {effectiveMuted ? (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
                    <path d="m17 9 4 6M21 9l-4 6" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
                    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
                    <path d="M19 6a8.5 8.5 0 0 1 0 12" />
                  </svg>
                )}
              </span>
            </button>
            <input
              className={styles.volRange}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={effectiveMuted ? 0 : volume}
              onChange={onVolumeChange}
              aria-label="Volume"
              aria-valuetext={`${volumePct} percent`}
              style={{ ["--vol" as string]: `${volumePct}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
