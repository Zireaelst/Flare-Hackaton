import { NextResponse } from "next/server";
import { createOrder } from "@/lib/relayer/createOrder";
import {
  ActionKind,
  OrderKind,
  WHOLE_BALANCE,
  fxrpToUba,
  usdToWei,
  ZERO_ADDRESS,
  type OrderParams,
} from "@/lib/tempo/orders";

export const maxDuration = 60;

type Body = {
  kind: "SCHEDULE" | "TAKE_PROFIT" | "STOP_LOSS";
  action: "VAULT_DEPOSIT" | "VAULT_WITHDRAW" | "REDEEM_TO_XRPL" | "SWAP_TO_STABLE";
  vault?: string;
  xrplAddress?: string;
  amountPerSlice: number;
  slices: number;
  intervalSeconds: number;
  priceTarget?: number;
  expiryDays: number;
  /** Take the whole position rather than a fixed amount. Vault exits only. */
  wholeBalance?: boolean;
  /** Optional: unwind the position when XRP/USD falls to this price. */
  exitBelow?: number;
  /** Stop the plan when the exit fires. Defaults to true. */
  stopPlanOnExit?: boolean;
  /** Dev-only: force a stuck mint to exercise recovery. See createOrder. */
  debugNonceOffset?: number;
};

/**
 * Demo guard rails. The XRPL wallet is ours and its balance is finite, so the
 * form is bounded server-side rather than trusting whatever the browser posts.
 */
const LIMITS = { maxAmountPerSlice: 20, maxSlices: 5, maxTotalFxrp: 40 };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;

    if (!body.wholeBalance && (!(body.amountPerSlice > 0) || body.amountPerSlice > LIMITS.maxAmountPerSlice)) {
      return NextResponse.json(
        { error: `amountPerSlice must be between 0 and ${LIMITS.maxAmountPerSlice} FXRP` },
        { status: 400 },
      );
    }
    if (body.wholeBalance && body.slices !== 1) {
      return NextResponse.json({ error: "taking the whole position is a single slice" }, { status: 400 });
    }
    if (!Number.isInteger(body.slices) || body.slices < 1 || body.slices > LIMITS.maxSlices) {
      return NextResponse.json({ error: `slices must be 1–${LIMITS.maxSlices}` }, { status: 400 });
    }
    if (!body.wholeBalance && body.amountPerSlice * body.slices > LIMITS.maxTotalFxrp) {
      return NextResponse.json(
        { error: `total order size is capped at ${LIMITS.maxTotalFxrp} FXRP on the demo` },
        { status: 400 },
      );
    }
    if (body.slices > 1 && body.intervalSeconds <= 0) {
      return NextResponse.json({ error: "a multi-slice order needs an interval" }, { status: 400 });
    }
    if (body.kind !== "SCHEDULE" && !(body.priceTarget && body.priceTarget > 0)) {
      return NextResponse.json({ error: "a price order needs a target" }, { status: 400 });
    }
    const needsVault = body.action === "VAULT_DEPOSIT" || body.action === "VAULT_WITHDRAW";
    if (needsVault && !body.vault) {
      return NextResponse.json({ error: `${body.action} needs a vault` }, { status: 400 });
    }
    // The contract would reject this too, but only after the XRP had moved and
    // the mint had reverted — which then costs a recovery to undo.
    if (body.action === "REDEEM_TO_XRPL" && !body.xrplAddress) {
      return NextResponse.json({ error: "a redemption needs an XRPL address" }, { status: 400 });
    }
    if (body.action === "SWAP_TO_STABLE") {
      return NextResponse.json(
        { error: "SparkDEX has no Coston2 deployment, so swaps cannot execute on testnet" },
        { status: 400 },
      );
    }

    const params: OrderParams = {
      kind: OrderKind[body.kind],
      action: ActionKind[body.action],
      vault: (body.action === "VAULT_DEPOSIT" ? body.vault! : ZERO_ADDRESS) as `0x${string}`,
      xrplAddress:
        body.action === "REDEEM_TO_XRPL" && body.xrplAddress
          ? (`0x${Buffer.from(body.xrplAddress, "utf8").toString("hex")}` as `0x${string}`)
          : "0x",
      amountPerSlice: body.wholeBalance ? WHOLE_BALANCE : fxrpToUba(body.amountPerSlice),
      slices: body.slices,
      intervalSeconds: BigInt(Math.max(body.intervalSeconds, 0)),
      priceTarget: body.priceTarget ? usdToWei(body.priceTarget) : 0n,
      expiry: BigInt(Math.floor(Date.now() / 1000) + body.expiryDays * 86_400),
    };

    // The exit rides in the same payment as the plan it protects. It takes
    // WHOLE_BALANCE because at this moment the plan has not run and there are
    // no shares to count.
    const exit: OrderParams | undefined =
      body.exitBelow && body.action === "VAULT_DEPOSIT"
        ? {
            kind: OrderKind.STOP_LOSS,
            action: ActionKind.VAULT_WITHDRAW,
            vault: body.vault! as `0x${string}`,
            xrplAddress: "0x",
            amountPerSlice: WHOLE_BALANCE,
            slices: 1,
            intervalSeconds: 0n,
            priceTarget: usdToWei(body.exitBelow),
            expiry: params.expiry,
          }
        : undefined;

    // Never reachable in production: the flag is not set there.
    const nonceOffset =
      process.env.ALLOW_DEBUG_ENDPOINTS === "1" && body.debugNonceOffset
        ? BigInt(body.debugNonceOffset)
        : 0n;

    return NextResponse.json(
      await createOrder(params, exit, body.stopPlanOnExit !== false, nonceOffset),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create the order" },
      { status: 500 },
    );
  }
}
