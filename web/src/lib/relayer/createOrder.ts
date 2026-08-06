import "server-only";
import { Wallet } from "xrpl";
import { getFxrpAddress } from "../flare/clients";
import { encodeCustomInstructionMemo, getNonce, getPersonalAccount } from "../flare/smartAccounts";
import { sendCoreVaultPayment } from "../flare/payments";
import { buildOrderCalls, type OrderParams } from "../tempo/orders";
import { config } from "../flare/config";
import type { RelayJob } from "./types";

export type CreateOrderResult = {
  job: RelayJob;
  xrplAddress: string;
  personalAccount: string;
  paymentAmountXrp: number;
  netMintXrp: number;
  memo: string;
};

/**
 * Turn a standing order into a single XRPL payment.
 *
 * This is the whole product in one function. The user operation is built and
 * committed to *before* any XRP moves, so the bytes the executor will need
 * already exist by the time the payment settles — there is no window where a
 * payment is sitting at the Core Vault with nobody able to say what it meant.
 */
export async function createOrder(
  params: OrderParams,
  exit: OrderParams | undefined,
  linkExit: boolean,
  /**
   * Deliberately build the user operation against the wrong nonce, so the mint
   * reverts with `InvalidNonce` and the payment strands at the Core Vault.
   *
   * This is the only way to exercise the recovery path on demand -- stuck mints
   * do not happen to order. Gated behind ALLOW_DEBUG_ENDPOINTS at the API
   * boundary so it cannot be reached in production.
   */
  nonceOffset = 0n,
): Promise<CreateOrderResult> {
  const wallet = Wallet.fromSeed(config.demoXrplSeed());

  const [personalAccount, fxrp] = await Promise.all([
    getPersonalAccount(wallet.address),
    getFxrpAddress(),
  ]);

  // Read the nonce once, immediately before sending. Two payments built against
  // the same nonce means one of them reverts and strands its XRP.
  const nonce = await getNonce(personalAccount);

  const calls = buildOrderCalls({ fxrp, tempo: config.tempoAddress, params, exit, linkExit });
  const { memoData, userOpData } = encodeCustomInstructionMemo({
    calls,
    sender: personalAccount,
    nonce: nonce + nonceOffset,
  });

  // The order needs its full total minted up front, since every slice is paid
  // out of the one allowance this payment establishes.
  const netMintXrp = Number(params.amountPerSlice * BigInt(params.slices)) / 1e6;

  const { xrplTxHash, paymentAmountXrp: sent } = await sendCoreVaultPayment({
    memoData,
    netMintXrp,
  });

  return {
    job: {
      status: "awaiting_xrpl_finality",
      intent: "create",
      xrplTxHash,
      userOpData,
      personalAccount,
      nonce: (nonce + nonceOffset).toString(),
      message: "Confirming on the XRP Ledger",
    },
    xrplAddress: wallet.address,
    personalAccount,
    paymentAmountXrp: sent,
    netMintXrp,
    memo: memoData,
  };
}
