import { NextResponse } from "next/server";

/**
 * Market price history for the chart.
 *
 * Proxied rather than fetched from the browser for two reasons: CoinGecko's
 * free tier is rate-limited per IP, so one server cache serves every visitor
 * instead of each of them spending the budget; and it keeps the client from
 * depending on a third-party CORS policy it does not control.
 *
 * This is *market* price. It is not what Tempo triggers on — that is FTSO, and
 * the chart draws it separately so any divergence between the two is visible
 * rather than hidden.
 */
const RANGES = {
  "1h": { days: "1", sliceMs: 60 * 60_000 },
  "24h": { days: "1", sliceMs: 24 * 60 * 60_000 },
  "7d": { days: "7", sliceMs: 7 * 24 * 60 * 60_000 },
} as const;

type RangeKey = keyof typeof RANGES;

export async function GET(request: Request) {
  const range = (new URL(request.url).searchParams.get("range") ?? "24h") as RangeKey;
  const config = RANGES[range] ?? RANGES["24h"];

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/ripple/market_chart?vs_currency=usd&days=${config.days}`,
      // One upstream call per minute, shared by everyone looking at the page.
      { next: { revalidate: 60 } },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `Price history unavailable (${response.status})` },
        { status: 502 },
      );
    }

    const data = (await response.json()) as { prices: [number, number][] };
    const cutoff = Date.now() - config.sliceMs;

    // days=1 returns five-minutely points, so a 1h view is a slice of the same
    // response rather than a second request.
    const points = data.prices
      .filter(([at]) => at >= cutoff)
      .map(([at, price]) => ({ at, price }));

    return NextResponse.json({ range, points, source: "CoinGecko" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Price history unavailable" },
      { status: 502 },
    );
  }
}
