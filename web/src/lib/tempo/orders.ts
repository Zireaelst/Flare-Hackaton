import { encodeFunctionData, erc20Abi, type Address } from "viem";
import { tempoAbi } from "./abi";

export const OrderKind = { SCHEDULE: 0, TAKE_PROFIT: 1, STOP_LOSS: 2 } as const;
export const ActionKind = { VAULT_DEPOSIT: 0, REDEEM_TO_XRPL: 1 } as const;

export type OrderKindValue = (typeof OrderKind)[keyof typeof OrderKind];
export type ActionKindValue = (typeof ActionKind)[keyof typeof ActionKind];

/** Mirrors Tempo.OrderParams. */
export type OrderParams = {
  kind: OrderKindValue;
  action: ActionKindValue;
  vault: Address;
  xrplAddress: `0x${string}`;
  amountPerSlice: bigint;
  slices: number;
  intervalSeconds: bigint;
  priceTarget: bigint;
  expiry: bigint;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** FXRP is 6-decimal, so one FXRP is one million UBA — the same unit as a drop. */
export const ONE_FXRP = 1_000_000n;

export function fxrpToUba(amount: number): bigint {
  return BigInt(Math.round(amount * 1e6));
}

/** FTSO returns 18-decimal USD, so price targets are expressed the same way. */
export function usdToWei(price: number): bigint {
  return BigInt(Math.round(price * 1e6)) * 10n ** 12n;
}

/**
 * The two calls a Tempo user operation makes.
 *
 * Both run inside `executeUserOp`, atomically with the mint, so by the time the
 * XRPL payment has settled the order already exists and is already funded. The
 * approve has to come first — `createOrder` records an order that will be paid
 * for out of this allowance later, and an order with no allowance behind it
 * would sit there reverting on every execution attempt.
 *
 * The approval is for exactly the order's total, not unlimited: a standing
 * order should not be able to authorize more than the user agreed to.
 */
export function buildOrderCalls({
  fxrp,
  tempo,
  params,
}: {
  fxrp: Address;
  tempo: Address;
  params: OrderParams;
}) {
  const total = params.amountPerSlice * BigInt(params.slices);

  return [
    {
      target: fxrp,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [tempo, total],
      }),
    },
    {
      target: tempo,
      value: 0n,
      data: encodeFunctionData({
        abi: tempoAbi,
        functionName: "createOrder",
        args: [params],
      }),
    },
  ];
}

/** Human-readable form of Tempo's NotExecutableReason enum. */
export const NOT_EXECUTABLE_REASON = [
  "ready",
  "no such order",
  "cancelled",
  "completed",
  "expired",
  "waiting for the next slice",
  "waiting for the price target",
  "price feed is stale",
  "allowance was revoked",
  "not enough FXRP",
] as const;
