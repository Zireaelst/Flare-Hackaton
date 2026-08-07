import "server-only";
import { erc20Abi, type Address } from "viem";
import { ftsoV2Abi } from "../flare/abis/flare";
import { publicClient, getFtsoV2, getFxrpAddress } from "../flare/clients";
import { config } from "../flare/config";
import { tempoAbi } from "./abi";
import { NOT_EXECUTABLE_REASON, NO_LINKED_ORDER } from "./orders";

export type OrderView = {
  id: string;
  owner: Address;
  kind: number;
  action: number;
  cancelled: boolean;
  vault: Address;
  amountPerSlice: string;
  slices: number;
  slicesExecuted: number;
  intervalSeconds: string;
  nextExecutionAt: string;
  expiry: string;
  priceTarget: string;
  /** The order this one disarms when it fires, if any. */
  cancelsOrderId: string | null;
  xrplAddress: string;
  executable: boolean;
  reason: string;
};

export async function getXrpUsdPrice(): Promise<{ price: number; timestamp: number }> {
  const [value, timestamp] = await publicClient.readContract({
    address: await getFtsoV2(),
    abi: ftsoV2Abi,
    functionName: "getFeedByIdInWei",
    args: [config.xrpUsdFeedId],
  });
  return { price: Number(value) / 1e18, timestamp: Number(timestamp) };
}

export async function getOrderCount(): Promise<number> {
  const count = await publicClient.readContract({
    address: config.tempoAddress,
    abi: tempoAbi,
    functionName: "orderCount",
  });
  return Number(count);
}

/**
 * Read every order, newest first, with its live executability.
 *
 * A plain scan is fine here and stays honest: it is exactly what the keeper
 * does, so the UI cannot show an order as ready that the keeper would skip.
 */
export async function listOrders(limit = 25): Promise<OrderView[]> {
  const count = await getOrderCount();
  if (count === 0) return [];

  const ids = Array.from({ length: Math.min(count, limit) }, (_, i) => BigInt(count - 1 - i));

  const results = await Promise.all(
    ids.map(async (id) => {
      const [order, preview] = await Promise.all([
        publicClient.readContract({
          address: config.tempoAddress,
          abi: tempoAbi,
          functionName: "getOrder",
          args: [id],
        }),
        publicClient.readContract({
          address: config.tempoAddress,
          abi: tempoAbi,
          functionName: "previewExecutable",
          args: [id],
        }),
      ]);

      const [executable, reason] = preview;

      return {
        id: id.toString(),
        owner: order.owner,
        kind: order.kind,
        action: order.action,
        cancelled: order.cancelled,
        vault: order.vault,
        amountPerSlice: order.amountPerSlice.toString(),
        slices: order.slices,
        slicesExecuted: order.slicesExecuted,
        intervalSeconds: order.intervalSeconds.toString(),
        nextExecutionAt: order.nextExecutionAt.toString(),
        expiry: order.expiry.toString(),
        priceTarget: order.priceTarget.toString(),
        cancelsOrderId:
          order.cancelsOrderId === NO_LINKED_ORDER ? null : order.cancelsOrderId.toString(),
        // Stored as raw bytes on-chain; it is an ASCII XRPL address.
        xrplAddress: order.xrplAddress === "0x" ? "" : Buffer.from(order.xrplAddress.slice(2), "hex").toString(),
        executable,
        reason: NOT_EXECUTABLE_REASON[reason] ?? "unknown",
      } satisfies OrderView;
    }),
  );

  return results;
}

export async function getFxrpBalance(account: Address): Promise<string> {
  const fxrp = await getFxrpAddress();
  const balance = await publicClient.readContract({
    address: fxrp,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
  return balance.toString();
}
