import "server-only";
import { Wallet, xrpToDrops } from "xrpl";
import { getFxrpAddress, withXrpl } from "../flare/clients";
import {
  computePaymentAmountXrp,
  encodeCustomInstructionMemo,
  getCoreVaultXrplAddress,
  getNonce,
  getPersonalAccount,
} from "../flare/smartAccounts";
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
export async function createOrder(params: OrderParams): Promise<CreateOrderResult> {
  const wallet = Wallet.fromSeed(config.demoXrplSeed());

  const [personalAccount, fxrp, coreVault] = await Promise.all([
    getPersonalAccount(wallet.address),
    getFxrpAddress(),
    getCoreVaultXrplAddress(),
  ]);

  // Read the nonce once, immediately before sending. Two payments built against
  // the same nonce means one of them reverts and strands its XRP.
  const nonce = await getNonce(personalAccount);

  const calls = buildOrderCalls({ fxrp, tempo: config.tempoAddress, params });
  const { memoData, userOpData } = encodeCustomInstructionMemo({
    calls,
    sender: personalAccount,
    nonce,
  });

  // The order needs its full total minted up front, since every slice is paid
  // out of the one allowance this payment establishes.
  const netMintXrp = Number(params.amountPerSlice * BigInt(params.slices)) / 1e6;
  const paymentAmountXrp = await computePaymentAmountXrp(netMintXrp);

  const xrplTxHash = await withXrpl(async (client) => {
    const balance = await client.getXrpBalance(wallet.address);
    if (balance < paymentAmountXrp) {
      throw new Error(
        `The demo XRPL wallet has ${balance} XRP but this order needs ${paymentAmountXrp} XRP.`,
      );
    }

    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: wallet.address,
      // Untagged on purpose: a destination tag would make FAssets credit the
      // tag holder rather than the smart account.
      Destination: coreVault,
      Amount: xrpToDrops(paymentAmountXrp),
      Memos: [{ Memo: { MemoData: memoData.slice(2) } }],
    });

    const signed = wallet.sign(prepared);
    const submitted = await client.submitAndWait(signed.tx_blob);
    return submitted.result.hash;
  });

  return {
    job: {
      status: "awaiting_xrpl_finality",
      xrplTxHash,
      userOpData,
      personalAccount,
      nonce: nonce.toString(),
      message: "Confirming on the XRP Ledger",
    },
    xrplAddress: wallet.address,
    personalAccount,
    paymentAmountXrp,
    netMintXrp,
    memo: memoData,
  };
}
