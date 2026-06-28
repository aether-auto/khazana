// A custom bench fader — NOT a styled <input type=range>. A hairline track, a
// machined amber thumb that lifts on grab (--ease-overshoot), a fill that scales
// from the left (transform: scaleX, like the house .bar-fill), a faint default
// notch on the track, and a ⌫ snap-to-default. Pointer drag + full keyboard
// support (arrows, Home/End, PageUp/Down). Reduced-motion: no thumb lift, value
// set instantly. Reused by the weight console (§2) and the decay half-life (§5).
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./BenchFader.module.css";

export interface BenchFaderProps {
  /** Accessible name + the row's small mono label. */
  label: string;
  /** The ranker constant name shown in mono caps (e.g. "W_AFFINITY"). */
  constantName?: string;
  value: number;
  min: number;
  max: number;
  /** The factory-default value — drawn as a notch, restored by ⌫. */
  defaultValue: number;
  /** Step for keyboard increments (drag is continuous, then quantized to this). */
  step?: number;
  /** Decimals shown in the value readout. */
  decimals?: number;
  /** Marks the dominant term (★, brighter amber). */
  starred?: boolean;
  /** A unit suffix for the readout (e.g. "d", "m"). */
  unit?: string;
  onChange: (value: number) => void;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export default function BenchFader({
  label,
  constantName,
  value,
  min,
  max,
  defaultValue,
  step = 0.1,
  decimals = 1,
  starred = false,
  unit = "",
  onChange,
}: BenchFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);

  const frac = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
  const defaultFrac = max > min ? clamp((defaultValue - min) / (max - min), 0, 1) : 0;

  // rAF-throttle the onChange during drag so a flick can't fire 200×/frame.
  const flush = useCallback(() => {
    rafRef.current = null;
    if (pendingRef.current != null) {
      onChange(pendingRef.current);
      pendingRef.current = null;
    }
  }, [onChange]);

  const queue = useCallback(
    (next: number) => {
      pendingRef.current = next;
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return value;
      const rect = el.getBoundingClientRect();
      const f = rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0;
      const raw = min + f * (max - min);
      // Quantize to `step`, then magnetic-snap to the default within ±2% of range.
      const snapped = Math.round(raw / step) * step;
      const range = max - min;
      const v = Math.abs(snapped - defaultValue) <= range * 0.02 ? defaultValue : snapped;
      return clamp(Number(v.toFixed(6)), min, max);
    },
    [value, min, max, step, defaultValue],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    queue(valueFromClientX(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    queue(valueFromClientX(e.clientX));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const big = (max - min) / 10;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = value + step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = value - step;
        break;
      case "PageUp":
        next = value + big;
        break;
      case "PageDown":
        next = value - big;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(clamp(Number(next.toFixed(6)), min, max));
  };

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const isDefault = Math.abs(value - defaultValue) < 1e-6;
  const readout = `${value.toFixed(decimals)}${unit}`;

  return (
    <div className={`${styles.row} ${starred ? styles.starred : ""}`}>
      <div className={styles.head}>
        <span className={styles.label}>
          {label}
          {starred && (
            <span className={styles.star} aria-hidden="true">
              ★
            </span>
          )}
        </span>
        {constantName && <span className={styles.const}>{constantName}</span>}
        <span className={`${styles.value} ${dragging ? styles.valueActive : ""}`}>{readout}</span>
        <button
          type="button"
          className={styles.reset}
          aria-label={`Reset ${label} to default ${defaultValue}`}
          disabled={isDefault}
          onClick={() => onChange(defaultValue)}
        >
          ⌫
        </button>
      </div>
      <div
        ref={trackRef}
        className={`${styles.track} ${dragging ? styles.trackDrag : ""}`}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={readout}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <span className={styles.fill} style={{ transform: `scaleX(${frac})` }} aria-hidden="true" />
        <span
          className={styles.notch}
          style={{ left: `${defaultFrac * 100}%` }}
          aria-hidden="true"
        />
        <span
          className={`${styles.thumb} ${dragging ? styles.thumbDrag : ""}`}
          style={{ left: `${frac * 100}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
