import { NextResponse } from "next/server";
import { getXrpUsdPrice } from "@/lib/tempo/read";

export const dynamic = "force-dynamic";

/**
 * The XRP/USD reading, on its own.
 *
 * Split out from /api/state because the chart polls every few seconds and
 * state does far more work — orders, pending withdrawals, balances. One cheap
 * contract read is all a tick needs.
 */
export async function GET() {
  try {
    const { price, timestamp } = await getXrpUsdPrice();
    return NextResponse.json({ price, timestamp, at: Date.now() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read the feed" },
      { status: 500 },
    );
  }
}
