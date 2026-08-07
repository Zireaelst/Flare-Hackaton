import { encodeFunctionData, erc20Abi, type Address } from "viem";
import { tempoAbi } from "./abi";

export const OrderKind = { SCHEDULE: 0, TAKE_PROFIT: 1, STOP_LOSS: 2 } as const;
export const ActionKind = {
  VAULT_DEPOSIT: 0,
  REDEEM_TO_XRPL: 1,
  VAULT_WITHDRAW: 2,
  /** SparkDEX is mainnet-only; the adapter rejects these at creation on testnet. */
  SWAP_TO_STABLE: 3,
} as const;

/**
 * `amountPerSlice` meaning "whatever the balance is when this fires".
 *
 * An exit is usually created in the same payment as the plan it protects,
 * before a single share exists to count — and shares accrue yield, so a figure
 * fixed weeks earlier would leave dust behind exactly when someone is trying to
 * get all the way out.
 */
export const WHOLE_BALANCE = (1n << 256n) - 1n;

/** `Tempo.NO_LINKED_ORDER` — this order disarms nothing when it fires. */
export const NO_LINKED_ORDER = (1n << 256n) - 1n;

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
 * The calls one XRPL payment authorizes.
 *
 * A user operation runs atomically with the mint, so by the time the payment
 * settles the orders already exist and are already funded. Approvals must come
 * before their `createOrder`: an order records something that will be paid for
 * out of an allowance later, and one with no allowance behind it would sit
 * reverting on every execution attempt.
 *
 * The optional `exit` is the point of the whole batch. Setting up a plan and
 * the condition that unwinds it in a *single* payment is the difference between
 * "you can enter DeFi from XRPL" — which Smart Accounts v1.3 already does — and
 * "you can leave it too, without being awake".
 */
export function buildOrderCalls({
  fxrp,
  tempo,
  params,
  exit,
  linkExit = true,
}: {
  fxrp: Address;
  tempo: Address;
  params: OrderParams;
  exit?: OrderParams;
  /** When false the two orders are independent and the plan keeps running. */
  linkExit?: boolean;
}) {
  const calls = [
    approvalFor({ fxrp, tempo, params }),
    {
      target: tempo,
      value: 0n,
      data: encodeFunctionData({ abi: tempoAbi, functionName: "createOrder", args: [params] }),
    },
  ];

  if (!exit) return calls;

  // Unlimited, unavoidably: the shares this will spend do not exist yet, and
  // their count keeps changing as the plan runs and yield accrues. The
  // allowance is only reachable through an order the user wrote, and only once
  // its trigger is genuinely satisfied on-chain.
  const shareApproval = approvalFor({ fxrp, tempo, params: exit });

  if (!linkExit) {
    // Two independent orders: the exit unwinds the position and the schedule
    // carries on regardless.
    calls.push(shareApproval, {
      target: tempo,
      value: 0n,
      data: encodeFunctionData({ abi: tempoAbi, functionName: "createOrder", args: [exit] }),
    });
    return calls;
  }

  // Linked: one call creates both orders and ties them together. The client
  // cannot do this itself — the plan's id does not exist until the transaction
  // runs, and predicting it from orderCount breaks the moment someone else's
  // order lands in between.
  calls.pop();
  calls.push(shareApproval, {
    target: tempo,
    value: 0n,
    data: encodeFunctionData({
      abi: tempoAbi,
      functionName: "createOrderWithExit",
      args: [params, exit],
    }),
  });

  return calls;
}

/**
 * The allowance an order needs, on the token it will actually spend.
 *
 * Not always FXRP: leaving a vault spends the user's shares. Getting this wrong
 * does not fail loudly — it approves a token the order never touches, and the
 * first execution reverts for want of an allowance on a different one.
 *
 * The amount is exact wherever it can be. It cannot be for a vault exit: the
 * shares do not exist yet when the order is written, and their count moves with
 * yield.
 */
function approvalFor({
  fxrp,
  tempo,
  params,
}: {
  fxrp: Address;
  tempo: Address;
  params: OrderParams;
}) {
  const isVaultExit = params.action === ActionKind.VAULT_WITHDRAW;
  const token = isVaultExit ? params.vault : fxrp;
  const amount =
    isVaultExit || params.amountPerSlice === WHOLE_BALANCE
      ? WHOLE_BALANCE
      : params.amountPerSlice * BigInt(params.slices);

  return {
    target: token,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve" as const,
      args: [tempo, amount] as const,
    }),
  };
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

/**
 * The one call a cancellation needs.
 *
 * `Tempo.cancel` requires the owner, and the owner is the PersonalAccount —
 * which can only act through a user operation. So cancelling is another XRPL
 * payment, exactly like creating. There is no back door where a relayer could
 * cancel on someone's behalf, which is the same property that stops a relayer
 * creating orders for them.
 *
 * Nothing is minted and nothing moves: the user's FXRP has never left their
 * account, and the allowance behind the order simply goes unused.
 */
export function buildCancelCalls({ tempo, orderId }: { tempo: Address; orderId: bigint }) {
  return [
    {
      target: tempo,
      value: 0n,
      data: encodeFunctionData({ abi: tempoAbi, functionName: "cancel", args: [orderId] }),
    },
  ];
}
