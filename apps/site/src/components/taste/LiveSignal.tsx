// §6 LIVE SIGNAL — the per-device live layer. Reads `khazana:deviceId` (the same
// key Beacon.astro writes), fetches `${PUBLIC_WORKER_URL}/summary?deviceId=`, and
// on success hydrates the personal layer: live-vs-snapshot affinity bars
// (mergeLiveSnapshot), the engagement sparkline (dailySparkline), and the
// still-learning fuel gauges (gateState / gaugeLabel). On failure / empty / no URL
// it silently stays on the build snapshot and the masthead pill reads "○ snapshot"
// — it NEVER throws (mirrors the Beacon's contract). The honest empty/learning
// state is the gauges + counts, not a dead card.
import { useEffect, useMemo, useState } from "react";
import {
  gateState,
  type EngagementEvent,
  type FeedItem,
} from "@khazana/core";
import {
  mergeLiveSnapshot,
  dailySparkline,
  gaugeLabel,
  liveProfileFromEvents,
} from "./lib/taste-derive.js";
import { useBenchData } from "./lib/use-bench-data.js";
import { GROUP_COLORS, channelGroup } from "../observatory/lib/build-analytics.js";
import styles from "./LiveSignal.module.css";

const DEVICE_KEY = "khazana:deviceId";

/** The exact /summary response shape (Worker, public, read-only). */
interface SummaryResponse {
  deviceId: string;
  eventCount: number;
  firstAt: string | null;
  lastAt: string | null;
  spanDays: number;
  ready: boolean;
  gates: { minEvents: number; minDays: number };
  daily: { date: string; weight: number }[];
  events: EngagementEvent[];
  topics?: Record<string, number>;
  formatAffinity?: Record<string, number>;
}

export interface LiveSignalProps {
  /** Where the masthead pill lives, toggled by this island. */
  pillId?: string;
}

type Status = "snapshot" | "loading" | "live";

function groupColor(group: string): string {
  return GROUP_COLORS[group] ?? GROUP_COLORS.science!;
}

export default function LiveSignal({ pillId = "live-pill" }: LiveSignalProps) {
  const { candidates: items, snapshotTopics, now } = useBenchData();
  const [status, setStatus] = useState<Status>("snapshot");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [deviceShort, setDeviceShort] = useState<string>("");

  useEffect(() => {
    const base = (import.meta.env.PUBLIC_WORKER_URL ?? "").trim();
    let deviceId = "";
    try {
      deviceId = localStorage.getItem(DEVICE_KEY) ?? "";
    } catch {
      deviceId = "";
    }
    if (deviceId) setDeviceShort(deviceId.slice(0, 4));
    if (!base || !deviceId) return; // no URL or no device → stay on snapshot, never throw

    setStatus("loading");
    const ctrl = new AbortController();
    fetch(`${base.replace(/\/$/, "")}/summary?deviceId=${encodeURIComponent(deviceId)}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: SummaryResponse) => {
        if (!data || typeof data.eventCount !== "number" || data.eventCount === 0) {
          setStatus("snapshot");
          setSummary(data ?? null); // keep gates/counts for the learning panel
          return;
        }
        setSummary(data);
        setStatus("live");
      })
      .catch(() => {
        // failure / abort / parse error → silently snapshot
        setStatus("snapshot");
      });
    return () => ctrl.abort();
  }, []);

  // Toggle the masthead pill imperatively (it lives outside this island's tree).
  useEffect(() => {
    const pill = document.getElementById(pillId);
    if (!pill) return;
    const dot = pill.querySelector<HTMLElement>("[data-pill-dot]");
    const label = pill.querySelector<HTMLElement>("[data-pill-label]");
    const live = status === "live";
    pill.setAttribute("data-live", live ? "1" : "0");
    if (dot) dot.textContent = live ? "●" : "○";
    if (label) {
      label.textContent = live
        ? `live · device ${deviceShort}…`
        : status === "loading"
          ? "checking signal…"
          : "snapshot";
    }
  }, [status, deviceShort, pillId]);

  // An itemsById map from the candidate corpus so live affinity is computed with
  // the SAME core aggregation the build runs (liveProfileFromEvents → core).
  const itemsById = useMemo(() => {
    const m = new Map<string, FeedItem>();
    for (const it of items) m.set(it.id, it as unknown as FeedItem);
    return m;
  }, [items]);

  // Live topic affinity: aggregate the device's events through core (parity with
  // the build). Fall back to the Worker's pre-aggregated topics if it ships them.
  const liveTopics = useMemo(() => {
    if (!summary || summary.eventCount === 0) return {};
    if (summary.events && summary.events.length > 0) {
      return liveProfileFromEvents(summary.events, itemsById, now).profile.topics;
    }
    return summary.topics ?? {};
  }, [summary, itemsById, now]);

  const rows = useMemo(
    () => mergeLiveSnapshot(snapshotTopics, liveTopics).slice(0, 8),
    [snapshotTopics, liveTopics],
  );
  const spark = useMemo(() => dailySparkline(summary?.daily ?? []), [summary]);

  const gate = summary
    ? gateState(summary.eventCount, summary.spanDays, {
        minEvents: summary.gates?.minEvents,
        minDays: summary.gates?.minDays,
      })
    : null;

  const isLive = status === "live";

  return (
    <div className={styles.live}>
      {/* status line */}
      <div className={styles.statusRow}>
        <span className={`${styles.dot} ${isLive ? styles.dotLive : ""}`} aria-hidden="true" />
        <span className={styles.statusLabel}>
          {isLive ? "live · this device" : "snapshot · build model"}
          {deviceShort && <span className={styles.device}> · {deviceShort}…</span>}
        </span>
        {summary && (
          <span className={styles.counts}>
            {summary.eventCount} events · {summary.spanDays} day{summary.spanDays === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* sparkline (only meaningful when there's daily data) */}
      {spark.length > 1 && (
        <div className={styles.sparkWrap} aria-label="Engagement over time">
          <svg viewBox={`0 0 ${spark.length * 6} 24`} preserveAspectRatio="none" className={styles.spark} role="img">
            <polyline
              points={spark.map((v, i) => `${i * 6},${24 - v * 22 - 1}`).join(" ")}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      )}

      {/* live-vs-snapshot bars (or just snapshot when not live) */}
      {rows.length > 0 && (
        <div className={styles.bars}>
          <div className={styles.barsHead}>
            {isLive ? "your live clicks vs. the build snapshot" : "topic affinity (build snapshot)"}
          </div>
          {rows.map((r) => (
            <div key={r.key} className={styles.barRow}>
              <span className={styles.barLabel} style={{ color: groupColor(channelGroup(r.key)) }}>
                {r.key}
              </span>
              <span className={styles.barTrack}>
                {isLive && (
                  <span
                    className={styles.barFillLive}
                    style={{ width: `${Math.round(r.live * 100)}%`, background: groupColor(channelGroup(r.key)) }}
                  />
                )}
                <span
                  className={styles.barFillSnap}
                  style={{ width: `${Math.round(r.snapshot * 100)}%` }}
                />
              </span>
              <span className={styles.barVals}>
                {isLive && <span className={styles.barLive}>{r.live.toFixed(2)}</span>}
                <span className={styles.barSnap}>{r.snapshot.toFixed(2)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* honest learning state — the fuel gauges ARE the content */}
      {gate && !gate.ready && (
        <div className={styles.gauges}>
          <FuelGauge label="events" value={summary!.eventCount} target={gate.minEvents} />
          <FuelGauge label="span" value={summary!.spanDays} target={gate.minDays} unit="days" />
          <p className={styles.gaugeLabel}>{gaugeLabel(gate)}</p>
        </div>
      )}
      {gate && gate.ready && (
        <p className={styles.ready}>model ready — the live layer is feeding your affinity.</p>
      )}

      <p className={styles.foot}>
        hydrated from <code>GET /summary</code> — falls back to the build snapshot if the Worker is quiet.
      </p>
    </div>
  );
}

function FuelGauge({ label, value, target, unit }: { label: string; value: number; target: number; unit?: string }) {
  const segments = Math.max(target, 1);
  const filled = Math.min(value, segments);
  return (
    <div className={styles.gauge}>
      <span className={styles.gaugeName}>{label}</span>
      <span className={styles.gaugeBar} aria-hidden="true">
        {Array.from({ length: segments }).map((_, i) => (
          <span key={i} className={`${styles.seg} ${i < filled ? styles.segOn : ""}`} />
        ))}
      </span>
      <span className={styles.gaugeCount}>
        {value} / {target}
        {unit ? ` ${unit}` : ""}
      </span>
    </div>
  );
}
