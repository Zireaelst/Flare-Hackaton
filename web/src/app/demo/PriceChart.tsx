"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Point = { price: number; at: number };

export type TargetLine = {
  orderId: string;
  price: number;
  /** TAKE_PROFIT fires above, STOP_LOSS below. Drawn differently. */
  above: boolean;
  label: string;
};

const STORAGE_KEY = "tempo.ftso.ticks";
const POLL_MS = 2_500;
const LIVE_WINDOW_MS = 30 * 60_000;

/**
 * Each range uses whichever source is actually better for it.
 *
 * CoinGecko's free tier does not go below five-minutely, so a 15-minute view of
 * it would be three points. Our own FTSO series samples every 2.5s, which makes
 * it the higher-resolution source at that scale — and the oracle price rather
 * than a market average.
 */
const RANGES = [
  { key: "15m", label: "15M", live: true, windowMs: 15 * 60_000 },
  { key: "1h", label: "1H", live: false, windowMs: 60 * 60_000 },
  { key: "24h", label: "24H", live: false, windowMs: 24 * 60 * 60_000 },
  { key: "7d", label: "7D", live: false, windowMs: 7 * 24 * 60 * 60_000 },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

function formatTime(at: number, range: RangeKey) {
  const date = new Date(at);
  if (range === "7d") {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function PriceChart({ targets }: { targets: TargetLine[] }) {
  const [range, setRange] = useState<RangeKey>("24h");
  const [ticks, setTicks] = useState<Point[]>([]);
  const [history, setHistory] = useState<Point[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [ftso, setFtso] = useState<{ price: number; timestamp: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; point: Point } | null>(null);
  const seeded = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // --- The oracle series, sampled continuously regardless of range ----------

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Point[];
        setTicks(parsed.filter((t) => Date.now() - t.at < LIVE_WINDOW_MS));
      }
    } catch {
      // A corrupt entry is not worth a broken chart.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const data = await (await fetch("/api/price", { cache: "no-store" })).json();
        if (cancelled || data.error) return;
        setFtso({ price: data.price, timestamp: data.timestamp });
        setTicks((previous) => {
          const next = [...previous, { price: data.price, at: data.at }].filter(
            (t) => data.at - t.at < LIVE_WINDOW_MS,
          );
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(-500)));
          } catch {
            // Private mode or quota — the chart still works in memory.
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

  // --- Market history, refetched when the range changes ---------------------

  useEffect(() => {
    const active = RANGES.find((r) => r.key === range);
    if (active?.live) return;

    let cancelled = false;
    const load = async () => {
      try {
        const data = await (await fetch(`/api/history?range=${range}`)).json();
        if (cancelled) return;
        if (data.error) {
          setHistoryError(data.error);
          return;
        }
        setHistoryError(null);
        setHistory(data.points as Point[]);
      } catch {
        if (!cancelled) setHistoryError("Price history unavailable");
      }
    };

    void load();
    // Market data moves far slower than the oracle; a minute is plenty.
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [range]);

  const activeRange = RANGES.find((r) => r.key === range)!;
  const series = activeRange.live
    ? ticks.filter((t) => Date.now() - t.at < activeRange.windowMs)
    : history;

  const first = series[0]?.price ?? null;
  const last = series.at(-1)?.price ?? null;
  const change = first !== null && last !== null && first !== 0 ? ((last - first) / first) * 100 : null;

  const geometry = useMemo(() => {
    if (series.length < 2) return null;

    const width = 1000;
    const height = 300;
    const padding = { top: 16, right: 74, bottom: 26, left: 8 };

    const prices = series.map((p) => p.price);
    // The oracle reading and any target share the axis. A line outside the
    // drawn range would silently vanish and read as never having been set.
    const extras = [...targets.map((t) => t.price), ...(ftso ? [ftso.price] : [])];
    const lo = Math.min(...prices, ...extras);
    const hi = Math.max(...prices, ...extras);

    // A floor on the domain, or auto-scaling turns fourth-decimal noise into a
    // mountain range and a flat market reads as violent.
    const mid = (lo + hi) / 2;
    const span = Math.max(hi - lo, mid * 0.006);
    const min = mid - span / 2 - span * 0.12;
    const max = mid + span / 2 + span * 0.12;

    const t0 = series[0].at;
    const t1 = series.at(-1)!.at;
    const timeSpan = Math.max(t1 - t0, 1);

    const x = (at: number) =>
      padding.left + ((at - t0) / timeSpan) * (width - padding.left - padding.right);
    const y = (price: number) =>
      padding.top + (1 - (price - min) / (max - min)) * (height - padding.top - padding.bottom);

    const line = series
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.at).toFixed(2)} ${y(p.price).toFixed(2)}`)
      .join(" ");
    const area = `${line} L ${x(t1).toFixed(2)} ${height - padding.bottom} L ${x(t0).toFixed(2)} ${height - padding.bottom} Z`;

    const gridPrices = [0.15, 0.5, 0.85].map((f) => min + (max - min) * f);
    const timeMarks = [0, 0.5, 1].map((f) => t0 + timeSpan * f);

    return { width, height, padding, x, y, line, area, min, max, t0, t1, gridPrices, timeMarks };
  }, [series, targets, ftso]);

  function onMove(event: React.MouseEvent<SVGSVGElement>) {
    if (!geometry || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const at = geometry.t0 + (geometry.t1 - geometry.t0) * Math.min(Math.max(ratio, 0), 1);

    // Nearest sample rather than an interpolation: the tooltip should quote a
    // reading that exists.
    let nearest = series[0];
    for (const point of series) {
      if (Math.abs(point.at - at) < Math.abs(nearest.at - at)) nearest = point;
    }
    setHover({ x: geometry.x(nearest.at), point: nearest });
  }

  const ftsoStale = ftso !== null && Date.now() / 1000 - ftso.timestamp > 300;

  return (
    <div className="rounded-2xl border border-black/8 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-black/45">XRP / USD</p>
          <div className="mt-1.5 flex items-baseline gap-3">
            <span className="text-4xl font-medium tracking-tight tabular-nums">
              {ftso ? `$${ftso.price.toFixed(4)}` : "—"}
            </span>
            {change !== null && (
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
                  : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
                <span className="ml-1.5 font-normal text-black/40">{activeRange.label}</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-black/45">
            {ftsoStale
              ? "FTSO reading is stale — Tempo would refuse a price order right now"
              : "Headline price is FTSO v2 — the only feed the contract triggers on."}
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-black/10 bg-black/[0.03] p-1">
          {RANGES.map((option) => (
            <button
              key={option.key}
              onClick={() => {
                setRange(option.key);
                setHover(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
                range === option.key ? "bg-black text-white" : "text-black/55 hover:text-black"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {geometry === null ? (
          <div className="flex h-[300px] items-center justify-center rounded-xl bg-black/[0.02] px-6 text-center text-sm text-black/45">
            {historyError ??
              (activeRange.live
                ? "Collecting oracle ticks — FTSO exposes only its latest value, so this range builds live."
                : "Loading price history…")}
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            className="h-[300px] w-full cursor-crosshair"
            preserveAspectRatio="none"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label={`XRP/USD over ${activeRange.label}, latest ${last?.toFixed(4)}`}
          >
            <defs>
              <linearGradient id="tempo-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FF6B3D" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#FF6B3D" stopOpacity="0" />
              </linearGradient>
            </defs>

            {geometry.gridPrices.map((price) => (
              <g key={price}>
                <line
                  x1={geometry.padding.left}
                  x2={geometry.width - geometry.padding.right}
                  y1={geometry.y(price)}
                  y2={geometry.y(price)}
                  stroke="rgba(0,0,0,0.06)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={geometry.width - geometry.padding.right + 6}
                  y={geometry.y(price) + 4}
                  fill="rgba(0,0,0,0.35)"
                  fontSize="11"
                >
                  ${price.toFixed(4)}
                </text>
              </g>
            ))}

            {geometry.timeMarks.map((at, index) => (
              <text
                key={at}
                x={geometry.x(at)}
                y={geometry.height - 6}
                fill="rgba(0,0,0,0.35)"
                fontSize="11"
                textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
              >
                {formatTime(at, range)}
              </text>
            ))}

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

            {/* The oracle, drawn against market history so divergence shows. */}
            {!activeRange.live && ftso && (
              <g>
                <line
                  x1={geometry.padding.left}
                  x2={geometry.width - geometry.padding.right}
                  y1={geometry.y(ftso.price)}
                  y2={geometry.y(ftso.price)}
                  stroke="#FF6B3D"
                  strokeWidth="1.5"
                  strokeDasharray="2 4"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={geometry.padding.left + 4}
                  y={geometry.y(ftso.price) - 6}
                  fill="#C2410C"
                  fontSize="11"
                >
                  FTSO ${ftso.price.toFixed(4)}
                </text>
              </g>
            )}

            {targets.map((target) => (
              <g key={target.orderId}>
                <line
                  x1={geometry.padding.left}
                  x2={geometry.width - geometry.padding.right}
                  y1={geometry.y(target.price)}
                  y2={geometry.y(target.price)}
                  stroke={target.above ? "#16A34A" : "#DC2626"}
                  strokeWidth="1"
                  strokeDasharray="5 5"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={geometry.width - geometry.padding.right + 6}
                  y={geometry.y(target.price) + 4}
                  fill={target.above ? "#16A34A" : "#DC2626"}
                  fontSize="11"
                >
                  {target.label}
                </text>
              </g>
            ))}

            {hover && (
              <g>
                <line
                  x1={hover.x}
                  x2={hover.x}
                  y1={geometry.padding.top}
                  y2={geometry.height - geometry.padding.bottom}
                  stroke="rgba(0,0,0,0.25)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={hover.x} cy={geometry.y(hover.point.price)} r="4" fill="#111111" />
              </g>
            )}

            {last !== null && !hover && (
              <circle cx={geometry.x(geometry.t1)} cy={geometry.y(last)} r="3.5" fill="#111111" />
            )}
          </svg>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-black/45">
        <span>
          {hover ? (
            <span className="tabular-nums text-black/70">
              ${hover.point.price.toFixed(4)} · {formatTime(hover.point.at, range)}
            </span>
          ) : activeRange.live ? (
            `${series.length} oracle readings · FTSO v2, ~2.5s sampling`
          ) : (
            "Line is market price from CoinGecko. The dashed orange line is what the contract sees."
          )}
        </span>
        {targets.length > 0 && (
          <span>Dashed green/red lines are live order targets.</span>
        )}
      </div>
    </div>
  );
}
