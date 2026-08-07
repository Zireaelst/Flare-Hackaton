"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Tick = { price: number; at: number };

export type TargetLine = {
  orderId: string;
  price: number;
  /** TAKE_PROFIT fires above, STOP_LOSS below. Drawn differently. */
  above: boolean;
  label: string;
};

const STORAGE_KEY = "tempo.ftso.ticks";
const POLL_MS = 2_500;
const WINDOW_MS = 30 * 60_000;
/** Below this the chart is a straight line and says so instead of pretending. */
const MIN_TICKS = 4;

/**
 * A live XRP/USD chart, plotted from the FTSO feed.
 *
 * Deliberately not an exchange API. The contract triggers on FTSO and nothing
 * else, so charting Coinbase here could show a target being crossed while the
 * contract disagrees — which would undermine the one claim the product rests
 * on. The cost is that FTSO exposes only its latest value: there is no history
 * to fetch, so the series is built by polling and kept in localStorage across
 * reloads.
 */
export function PriceChart({ targets }: { targets: TargetLine[] }) {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const seeded = useRef(false);

  // Restore before the first poll so a reload does not start from nothing.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Tick[];
        setTicks(parsed.filter((t) => Date.now() - t.at < WINDOW_MS));
      }
    } catch {
      // A corrupt entry is not worth a broken chart.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const response = await fetch("/api/price", { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setError(null);
        // The feed carries its own timestamp; if it stops advancing the chart
        // should say so rather than drawing a confident flat line.
        setStale(Date.now() / 1000 - data.timestamp > 300);

        setTicks((previous) => {
          const next = [...previous, { price: data.price, at: data.at }].filter(
            (t) => data.at - t.at < WINDOW_MS,
          );
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(-400)));
          } catch {
            // Private mode, quota, whatever — the chart still works in memory.
          }
          return next;
        });
      } catch {
        // Transient failures are normal; the next tick retries.
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const latest = ticks.at(-1)?.price ?? null;
  const first = ticks[0]?.price ?? null;
  const change = latest !== null && first !== null && first !== 0 ? ((latest - first) / first) * 100 : null;

  const geometry = useMemo(() => {
    if (ticks.length < 2) return null;

    const width = 1000;
    const height = 280;
    const padding = { top: 18, right: 66, bottom: 22, left: 8 };

    const prices = ticks.map((t) => t.price);
    // Targets share the axis, otherwise a line sitting outside the price range
    // silently disappears and the user thinks it was never set.
    const relevantTargets = targets.map((t) => t.price);
    const lo = Math.min(...prices, ...relevantTargets);
    const hi = Math.max(...prices, ...relevantTargets);

    // A floor on the domain, or auto-scaling turns fourth-decimal noise into a
    // mountain range and a flat market reads as violent. The chart should look
    // calm when the price is calm.
    const observed = hi - lo;
    const floor = ((lo + hi) / 2) * 0.006;
    const span = Math.max(observed, floor);
    const mid = (lo + hi) / 2;
    const min = mid - span / 2 - span * 0.12;
    const max = mid + span / 2 + span * 0.12;

    const t0 = ticks[0].at;
    const t1 = ticks.at(-1)!.at;
    const timeSpan = Math.max(t1 - t0, 1);

    const x = (at: number) =>
      padding.left + ((at - t0) / timeSpan) * (width - padding.left - padding.right);
    const y = (price: number) =>
      padding.top + (1 - (price - min) / (max - min)) * (height - padding.top - padding.bottom);

    const line = ticks.map((t, i) => `${i === 0 ? "M" : "L"} ${x(t.at).toFixed(2)} ${y(t.price).toFixed(2)}`).join(" ");
    const area = `${line} L ${x(t1).toFixed(2)} ${height - padding.bottom} L ${x(t0).toFixed(2)} ${height - padding.bottom} Z`;

    return { width, height, padding, x, y, line, area, min, max, t1 };
  }, [ticks, targets]);

  return (
    <div className="rounded-2xl border border-black/8 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-black/45">XRP / USD · FTSO v2</p>
          <div className="mt-1.5 flex items-baseline gap-3">
            <span className="text-4xl font-medium tracking-tight tabular-nums">
              {latest === null ? "—" : `$${latest.toFixed(4)}`}
            </span>
            {change !== null && ticks.length >= MIN_TICKS && (
              <span
                className={`text-sm font-medium tabular-nums ${
                  Math.abs(change) < 0.005
                    ? "text-black/40"
                    : change > 0
                      ? "text-[#16A34A]"
                      : "text-[#DC2626]"
                }`}
              >
                {/* "-0.000%" is noise dressed as a fact. */}
                {Math.abs(change) < 0.005
                  ? "flat"
                  : `${change > 0 ? "+" : ""}${change.toFixed(3)}%`}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-black/45">
            {stale
              ? "Feed is stale — Tempo would refuse to execute a price order right now"
              : "The same feed the contract reads. Block-latency, ~1.8s."}
          </p>
        </div>

        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.15em] text-black/45">Window</p>
          <p className="mt-1 text-sm tabular-nums text-black/70">
            {ticks.length < 2 ? "collecting" : `${ticks.length} ticks · live`}
          </p>
        </div>
      </div>

      <div className="mt-5">
        {geometry === null ? (
          <div className="flex h-[280px] items-center justify-center rounded-xl bg-black/[0.02] text-sm text-black/45">
            {error ?? "Collecting ticks — FTSO exposes only its latest value, so the series builds live."}
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            className="h-[280px] w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label={`XRP/USD, ${ticks.length} readings, latest ${latest?.toFixed(4)}`}
          >
            <defs>
              <linearGradient id="tempo-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF6B3D" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#FF6B3D" stopOpacity="0" />
              </linearGradient>
            </defs>

            <path d={geometry.area} fill="url(#tempo-area)" />
            <path
              d={geometry.line}
              fill="none"
              stroke="#111111"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            {targets.map((target) => {
              const ty = geometry.y(target.price);
              return (
                <g key={target.orderId}>
                  <line
                    x1={geometry.padding.left}
                    x2={geometry.width - geometry.padding.right}
                    y1={ty}
                    y2={ty}
                    stroke={target.above ? "#16A34A" : "#DC2626"}
                    strokeWidth="1"
                    strokeDasharray="5 5"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={geometry.width - geometry.padding.right + 6}
                    y={ty + 4}
                    fill={target.above ? "#16A34A" : "#DC2626"}
                    fontSize="11"
                    className="tabular-nums"
                  >
                    {target.label}
                  </text>
                </g>
              );
            })}

            {latest !== null && (
              <circle cx={geometry.x(geometry.t1)} cy={geometry.y(latest)} r="3.5" fill="#111111" />
            )}
          </svg>
        )}
      </div>

      {targets.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-black/45">
          Dashed lines are live order targets. When the price crosses one, the order becomes
          executable by anyone — the contract re-reads this feed itself rather than trusting a
          caller.
        </p>
      )}
    </div>
  );
}
