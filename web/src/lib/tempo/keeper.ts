import "server-only";
import { publicClient, relayerAccount, walletClient } from "../flare/clients";
import { config } from "../flare/config";
import { tempoAbi } from "./abi";

export type KeeperResult = {
  scanned: number;
  due: string[];
  executed: { orderId: string; txHash: string }[];
  failed: { orderId: string; error: string }[];
};

/**
 * Execute every order that is due right now.
 *
 * The keeper is a convenience, never an authority. It supplies no price and no
 * timestamp — only an order id — and Tempo re-derives every condition itself.
 * If this process never runs again, orders stay valid and anyone else can
 * execute them; the only thing lost is punctuality.
 *
 * It also asks the contract which orders are due rather than keeping an index,
 * so there is no local state to drift out of sync with the chain.
 */
export async function runKeeper(maxOrders = 100): Promise<KeeperResult> {
  const count = await publicClient.readContract({
    address: config.tempoAddress,
    abi: tempoAbi,
    functionName: "orderCount",
  });

  const scanned = Math.min(Number(count), maxOrders);
  if (scanned === 0) return { scanned: 0, due: [], executed: [], failed: [] };

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

  return { scanned, due: due.map((id) => id.toString()), executed, failed };
}
