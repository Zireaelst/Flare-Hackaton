import { NextResponse } from "next/server";
import { runKeeper } from "@/lib/tempo/keeper";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Run the keeper once.
 *
 * Called from the demo page so a judge can watch an order execute on demand,
 * and from a GitHub Actions cron so orders still fire when nobody is looking.
 * Vercel Hobby crons only run once a day, which is useless for a DCA schedule,
 * so the scheduling lives in Actions instead.
 *
 * Protected by a shared secret only to stop strangers spending the keeper's
 * gas. It is not a security boundary: `Tempo.execute` is permissionless by
 * design, so anyone may execute a due order from their own wallet.
 */
function authorized(request: Request): boolean {
  const secret = process.env.KEEPER_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runKeeper());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Keeper run failed" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
