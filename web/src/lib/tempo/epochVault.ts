import "server-only";
import type { Address } from "viem";
import { publicClient } from "../flare/clients";

/**
 * Flare's FXRP yield vaults are not plain ERC-4626.
 *
 * `redeem` does not pay out. It burns the shares and files a withdrawal against
 * a daily period; the assets are released only after the vault's lag has
 * elapsed. Measured on Coston2's `TESTstXRP`: `lagDuration` 300 seconds,
 * `PERIOD_DURATION` one day.
 *
 * That makes leaving a position a two-step affair separated by a wait — notice
 * the moment, request, then come back and claim. It is the clearest
 * justification for Tempo existing: an XRPL-only user would need a separate
 * signed payment for each step, at a time nobody can be relied on to be awake
 * for.
 *
 * The saving grace is that `claim` takes the receiver as an argument rather
 * than paying `msg.sender`, so anyone may finish someone else's withdrawal.
 * The keeper can close the loop without holding any authority over the user.
 */
export const epochVaultAbi = [
  {
    type: "function",
    name: "getWithdrawalEpoch",
    inputs: [],
    outputs: [
      { name: "_year", type: "uint256" },
      { name: "_month", type: "uint256" },
      { name: "_day", type: "uint256" },
      { name: "_claimableEpoch", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pendingWithdrawShares",
    inputs: [
      { name: "receiverAddr", type: "address" },
      { name: "period", type: "uint256" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pendingWithdrawAssets",
    inputs: [
      { name: "receiverAddr", type: "address" },
      { name: "period", type: "uint256" },
    ],
    outputs: [{ name: "assets", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claim",
    inputs: [
      { name: "_year", type: "uint256" },
      { name: "_month", type: "uint256" },
      { name: "_day", type: "uint256" },
      { name: "_receiverAddr", type: "address" },
    ],
    outputs: [
      { name: "_shares", type: "uint256" },
      { name: "_assets", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
] as const;

/** Withdrawal periods are day indices: `floor(unixSeconds / 86400)`. */
export const SECONDS_PER_PERIOD = 86_400n;

export function periodForDate(year: number, month: number, day: number): bigint {
  return BigInt(Math.floor(Date.UTC(year, month - 1, day) / 1000)) / SECONDS_PER_PERIOD;
}

export type PendingWithdrawal = {
  vault: Address;
  receiver: Address;
  /** Day index the request was filed under. */
  period: string;
  shares: string;
  /** The date `claim` expects, derived from the period. */
  year: number;
  month: number;
  day: number;
};

function dateForPeriod(period: bigint): { year: number; month: number; day: number } {
  const date = new Date(Number(period * SECONDS_PER_PERIOD) * 1000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/**
 * Look for a queued withdrawal belonging to `receiver`.
 *
 * Checks today and the previous few days rather than reading logs: Coston2
 * caps `eth_getLogs` at a 30-block range, so a log scan wide enough to be
 * useful would take hundreds of requests. A withdrawal that has gone unclaimed
 * for longer than this window is stale enough to need a human anyway.
 */
export async function findPendingWithdrawals({
  vault,
  receiver,
  lookbackDays = 7,
}: {
  vault: Address;
  receiver: Address;
  lookbackDays?: number;
}): Promise<PendingWithdrawal[]> {
  const today = BigInt(Math.floor(Date.now() / 1000)) / SECONDS_PER_PERIOD;

  const periods = Array.from({ length: lookbackDays + 1 }, (_, i) => today - BigInt(i));

  const results = await Promise.all(
    periods.map(async (period) => {
      try {
        const shares = await publicClient.readContract({
          address: vault,
          abi: epochVaultAbi,
          functionName: "pendingWithdrawShares",
          args: [receiver, period],
        });
        if (shares === 0n) return null;
        return { vault, receiver, period: period.toString(), shares: shares.toString(), ...dateForPeriod(period) };
      } catch {
        // Not an epoch vault, or the call is unsupported. A vault that pays out
        // synchronously simply has nothing pending, which is the same answer.
        return null;
      }
    }),
  );

  return results.filter((r): r is PendingWithdrawal => r !== null);
}
