import "server-only";
import { Wallet, xrpToDrops } from "xrpl";
import { withXrpl } from "./clients";
import { computePaymentAmountXrp, getCoreVaultXrplAddress } from "./smartAccounts";
import { config } from "./config";

/**
 * Send one XRPL payment to the FAssets Core Vault carrying a smart-account memo.
 *
 * Shared by order creation and by recovery, because they are the same act: an
 * XRPL payment whose memo tells the controller what to do. Only the opcode in
 * the memo differs.
 */
export async function sendCoreVaultPayment({
  memoData,
  netMintXrp,
}: {
  memoData: `0x${string}`;
  netMintXrp: number;
}): Promise<{ xrplTxHash: string; paymentAmountXrp: number; from: string }> {
  const wallet = Wallet.fromSeed(config.demoXrplSeed());
  const [coreVault, paymentAmountXrp] = await Promise.all([
    getCoreVaultXrplAddress(),
    computePaymentAmountXrp(netMintXrp),
  ]);

  const xrplTxHash = await withXrpl(async (client) => {
    const balance = await client.getXrpBalance(wallet.address);
    if (balance < paymentAmountXrp) {
      throw new Error(
        `The demo XRPL wallet has ${balance} XRP but this needs ${paymentAmountXrp} XRP.`,
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
    return (await client.submitAndWait(signed.tx_blob)).result.hash;
  });

  return { xrplTxHash, paymentAmountXrp, from: wallet.address };
}
