import { NextResponse } from "next/server";
import { step } from "@/lib/relayer/pipeline";
import type { RelayJob } from "@/lib/relayer/types";

export const maxDuration = 60;

/**
 * Advance one relay by one step.
 *
 * The caller holds the job and posts it back each time. Everything in it is
 * re-validated against the XRP Ledger before any gas is spent, so a caller who
 * tampers with the job only breaks their own relay.
 */
export async function POST(request: Request) {
  try {
    const job = (await request.json()) as RelayJob;

    if (!job?.xrplTxHash || !job?.userOpData || !job?.personalAccount) {
      return NextResponse.json({ error: "malformed job" }, { status: 400 });
    }

    return NextResponse.json(await step(job));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Relay step failed" },
      { status: 500 },
    );
  }
}
