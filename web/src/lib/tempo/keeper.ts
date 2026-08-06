import "server-only";
import type { Address } from "viem";
import { publicClient, relayerAccount, walletClient } from "../flare/clients";
import { config } from "../flare/config";
import { tempoAbi } from "./abi";
import { epochVaultAbi, findPendingWithdrawals, type PendingWithdrawal } from "./epochVault";

export type KeeperResult = {
  scanned: number;
  due: string[];
  executed: { orderId: string; txHash: string }[];
  failed: { orderId: string; error: string }[];
  /** Second-phase vault withdrawals finished on a user's behalf. */
  claimed: { vault: string; receiver: string; shares: string; txHash: string }[];
  /** Queued withdrawals the vault will not release yet. */
  pending: PendingWithdrawal[];
};

const ACTION_VAULT_WITHDRAW = 2;

/**
 * Execute every order that is due, then finish any withdrawal the vault has
 * released.
 *
 * The keeper is a convenience, never an authority. It supplies no price and no
 * timestamp — only an order id — and Tempo re-derives every condition itself.
 * If this process never runs again, orders stay valid and anyone else can
 * execute them; the only thing lost is punctuality.
 *
 * It keeps no state either. Both what is due and what is claimable are asked
 * of the chain on every run, so there is no local index to drift out of sync.
 */
export async function runKeeper(maxOrders = 100): Promise<KeeperResult> {
  const count = await publicClient.readContract({
    address: config.tempoAddress,
    abi: tempoAbi,
    functionName: "orderCount",
  });

  const scanned = Math.min(Number(count), maxOrders);
  const empty: KeeperResult = { scanned: 0, due: [], executed: [], failed: [], claimed: [], pending: [] };
  if (scanned === 0) return empty;

  const due = await publicClient.readContract({
    address: config.tempoAddress,
    abi: tempoAbi,
    functionName: "dueOrders",
    args: [0n, BigInt(scanned)],
  });

  const executed: KeeperResult["executed"] = [];
  const failed: KeeperResult["failed"] = [];

  for (const orderId of due) {
    try {
      // Simulate first. A revert here costs nothing, whereas sending the
      // transaction anyway burns gas to learn the same thing.
      await publicClient.simulateContract({
        account: relayerAccount(),
        address: config.tempoAddress,
        abi: tempoAbi,
        functionName: "execute",
        args: [orderId],
      });

      const hash = await walletClient().writeContract({
        account: relayerAccount(),
        chain: null,
        address: config.tempoAddress,
        abi: tempoAbi,
        functionName: "execute",
        args: [orderId],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      executed.push({ orderId: orderId.toString(), txHash: hash });
    } catch (error) {
      // One bad order must not stop the rest. A failure here is expected
      // whenever an order becomes ineligible between the scan and the send.
      failed.push({
        orderId: orderId.toString(),
        error: error instanceof Error ? error.message.split("\n")[0] : String(error),
      });
    }
  }

  const { claimed, pending } = await settleWithdrawals(scanned);

  return { scanned, due: due.map((id) => id.toString()), executed, failed, claimed, pending };
}

/**
 * Finish the second phase of any vault exit that has become claimable.
 *
 * Flare's FXRP vaults queue withdrawals against a daily period and pay only
 * once the vault operator has processed it, so an exit that fires today is
 * claimable tomorrow. Without this the user would have to notice the moment
 * themselves and sign another XRPL payment — the exact manual step Tempo
 * exists to remove.
 *
 * Nothing here needs the user's authority: `claim` takes the receiver as an
 * argument and pays them, so the keeper is spending its own gas to hand
 * someone else their money.
 */
async function settleWithdrawals(
  scanned: number,
): Promise<{ claimed: KeeperResult["claimed"]; pending: PendingWithdrawal[] }> {
  const claimed: KeeperResult["claimed"] = [];
  const pending: PendingWithdrawal[] = [];

  // Who might be owed something: anyone whose exit order has actually run.
  const exits = new Map<string, { vault: Address; owner: Address }>();
  for (let i = 0; i < scanned; i++) {
    const order = await publicClient.readContract({
      address: config.tempoAddress,
      abi: tempoAbi,
      functionName: "getOrder",
      args: [BigInt(i)],
    });
    if (order.action !== ACTION_VAULT_WITHDRAW || order.slicesExecuted === 0) continue;
    exits.set(`${order.vault}:${order.owner}`, { vault: order.vault, owner: order.owner });
  }

  for (const { vault, owner } of exits.values()) {
    for (const withdrawal of await findPendingWithdrawals({ vault, receiver: owner })) {
      try {
        // The vault is the authority on whether a period has been processed.
        // Simulating is how we ask, rather than tracking epochs ourselves and
        // being wrong about it.
        await publicClient.simulateContract({
          account: relayerAccount(),
          address: vault,
          abi: epochVaultAbi,
          functionName: "claim",
          args: [BigInt(withdrawal.year), BigInt(withdrawal.month), BigInt(withdrawal.day), owner],
        });

        const hash = await walletClient().writeContract({
          account: relayerAccount(),
          chain: null,
          address: vault,
          abi: epochVaultAbi,
          functionName: "claim",
          args: [BigInt(withdrawal.year), BigInt(withdrawal.month), BigInt(withdrawal.day), owner],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        claimed.push({ vault, receiver: owner, shares: withdrawal.shares, txHash: hash });
      } catch {
        // Not released yet. This is the normal state for most of a period, so
        // it is reported as pending rather than logged as a failure.
        pending.push(withdrawal);
      }
    }
  }

  return { claimed, pending };
}
