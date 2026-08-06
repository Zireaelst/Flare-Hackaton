import "server-only";
import { Wallet } from "xrpl";
import { encodeCustomInstructionMemo, getNonce, getPersonalAccount } from "../flare/smartAccounts";
import { sendCoreVaultPayment } from "../flare/payments";
import { buildCancelCalls } from "../tempo/orders";
import { config } from "../flare/config";
import type { RelayJob } from "./types";

/**
 * How much XRP a cancellation mints.
 *
 * Zero would be tidier, but fee-only direct mints are documented to revert, and
 * a cancellation is the last thing that should be fragile — it is what a user
 * reaches for when they have changed their mind about money. A token amount
 * keeps the payment on the well-trodden path, and the FXRP it mints lands in
 * the user's own account rather than being spent.
 */
const CANCEL_NET_MINT_XRP = 1;

export type CancelOrderResult = {
  job: RelayJob;
  personalAccount: string;
  paymentAmountXrp: number;
};

/** Cancel a standing order with one XRPL payment. */
export async function cancelOrder(orderId: bigint): Promise<CancelOrderResult> {
  const wallet = Wallet.fromSeed(config.demoXrplSeed());
  const personalAccount = await getPersonalAccount(wallet.address);

  // Read once, immediately before sending: two payments built against the same
  // nonce means one of them reverts and strands its XRP.
  const nonce = await getNonce(personalAccount);

  const { memoData, userOpData } = encodeCustomInstructionMemo({
    calls: buildCancelCalls({ tempo: config.tempoAddress, orderId }),
    sender: personalAccount,
    nonce,
  });

  const { xrplTxHash, paymentAmountXrp } = await sendCoreVaultPayment({
    memoData,
    netMintXrp: CANCEL_NET_MINT_XRP,
  });

  return {
    job: {
      status: "awaiting_xrpl_finality",
      intent: "cancel",
      xrplTxHash,
      userOpData,
      personalAccount,
      nonce: nonce.toString(),
      message: "Confirming your cancellation",
    },
    personalAccount,
    paymentAmountXrp,
  };
}
