import { NextResponse } from "next/server";
import { cancelOrder } from "@/lib/relayer/cancelOrder";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { orderId } = (await request.json()) as { orderId?: string };
    if (orderId === undefined || !/^\d+$/.test(orderId)) {
      return NextResponse.json({ error: "orderId must be a decimal string" }, { status: 400 });
    }

    return NextResponse.json(await cancelOrder(BigInt(orderId)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel the order" },
      { status: 500 },
    );
  }
}
