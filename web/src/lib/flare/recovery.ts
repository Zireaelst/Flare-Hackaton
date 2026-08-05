import "server-only";
import { concatHex, padHex, toHex, type Address } from "viem";
import { publicClient, getMasterAccountController } from "./clients";
import { normalizeXrplTxId } from "./smartAccounts";
import { abi as memoInstructionsFacetAbi } from "./abis/memoInstructionsFacet";

/**
 * Recovery for direct mints that did not go through.
 *
 * This is the half of Smart Accounts that users are otherwise expected to drive
 * by hand-crafting further XRPL payments. When `executeDirectMintingWithData`
 * reverts, the whole Flare transaction rolls back but the XRP has already left
 * the user's wallet and is sitting at the Core Vault. Nothing on Flare will
 * ever retry it on its own, and the naive reaction — resending the payment —
 * is the single worst move available, because the second payment reuses the
 * same nonce and strands itself too.
 */

/** `PaymentAlreadyConfirmed()` — another executor already finalized this payment. */
const PAYMENT_ALREADY_CONFIRMED = "0x18dce79f";

/**
 * Opcode `0xE0` — mark a stuck payment's memo to be skipped on its next
 * direct mint, so the FXRP can be recovered without running the user
 * operation that failed.
 *
 * Same 42-byte header shape as `0xFE`:
 *   [ 0xE0 | walletId(1) | executorFeeUBA(8) | targetTxId(32) ]
 */
export function encodeSkipMemo({
  targetTxId,
  walletId = 0,
  executorFeeUBA = 0n,
}: {
  targetTxId: string;
  walletId?: number;
  executorFeeUBA?: bigint;
}): `0x${string}` {
  return concatHex([
    "0xE0",
    toHex(walletId, { size: 1 }),
    toHex(executorFeeUBA, { size: 8 }),
    padHex(normalizeXrplTxId(targetTxId), { size: 32 }),
  ]);
}

/**
 * Opcode `0xE1` — fast-forward the memo-instruction nonce past an abandoned
 * user operation.
 *
 *   [ 0xE1 | walletId(1) | executorFeeUBA(8) | newNonce(32) ]
 *
 * Needed because `0xE0` recovers the FXRP but deliberately skips the original
 * operation, leaving `getNonce` still pointing at the slot that operation
 * would have consumed. Until it moves, every new instruction is built against
 * a nonce the controller will reject.
 */
export function encodeFastForwardNonce({
  newNonce,
  walletId = 0,
  executorFeeUBA = 0n,
}: {
  newNonce: bigint;
  walletId?: number;
  executorFeeUBA?: bigint;
}): `0x${string}` {
  return concatHex([
    "0xE1",
    toHex(walletId, { size: 1 }),
    toHex(executorFeeUBA, { size: 8 }),
    padHex(toHex(newNonce), { size: 32 }),
  ]);
}

/**
 * Both recovery opcodes must carry a positive net mint. Fee-only direct mints
 * revert on-chain, so a recovery payment that tried to send nothing but fees
 * would itself get stuck — turning one stranded payment into two.
 */
export const RECOVERY_NET_MINT_XRP = 1;

/** Pull the 4-byte custom-error selector out of a viem error chain, if there is one. */
function revertSelector(error: unknown): string | null {
  let current: unknown = error;
  while (current != null && typeof current === "object") {
    const candidate = current as { signature?: string; raw?: string; data?: string; cause?: unknown };
    const raw = candidate.signature ?? candidate.raw ?? candidate.data;
    if (typeof raw === "string" && raw.startsWith("0x") && raw.length >= 10) {
      return raw.slice(0, 10).toLowerCase();
    }
    current = candidate.cause;
  }
  return null;
}

/** Whether a revert was `PaymentAlreadyConfirmed()`. */
export function isPaymentAlreadyConfirmed(error: unknown): boolean {
  return revertSelector(error) === PAYMENT_ALREADY_CONFIRMED;
}

/**
 * Whether the chain rejected the call, as opposed to the network failing.
 *
 * The distinction decides whether recovery runs at all: a revert means the XRP
 * is stranded and needs a recovery payment, while a timeout or a bad RPC
 * response means nothing happened and retrying is enough. Sending a recovery
 * payment for a network blip would spend real XRP to fix a problem that does
 * not exist.
 */
export function isContractRevert(error: unknown): boolean {
  if (revertSelector(error) !== null) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /execution reverted|reverted with the following/i.test(message);
}

/**
 * A short description of why a mint reverted.
 *
 * Named errors are decoded; anything else is reported by selector rather than
 * guessed at. FAssets reverts with selectors that appear in none of the
 * published ABIs, and inventing a friendly name for one of those would be
 * worse than admitting we do not know it — the operator can still look it up.
 */
export function describeRevert(error: unknown): string {
  const selector = revertSelector(error);
  if (!selector) return error instanceof Error ? error.message.split("\n")[0] : String(error);

  const known: Record<string, string> = {
    "0x24d79641": "InvalidNonce — the nonce moved before this operation ran",
    "0x82a0be6e": "CustomInstructionHashMismatch — the memo did not match the user operation",
    "0xcdbd2205": "TransactionAlreadyExecuted",
    "0xa08a8d1c": "WrongExecutor",
    "0x87341bc2": "InvalidMemoData",
    "0xa7ecd285": "InsufficientAmountForFee",
    "0x1b0e814f": "CallFailed — a call inside the user operation reverted",
    [PAYMENT_ALREADY_CONFIRMED]: "PaymentAlreadyConfirmed",
  };

  return known[selector] ?? `revert ${selector}`;
}

/** Has this XRPL payment already been consumed by a direct mint on Flare? */
export async function isTransactionIdUsed(xrplTxHash: string): Promise<boolean> {
  return publicClient.readContract({
    address: await getMasterAccountController(),
    abi: memoInstructionsFacetAbi,
    functionName: "isTransactionIdUsed",
    args: [normalizeXrplTxId(xrplTxHash)],
  }) as Promise<boolean>;
}

export type StuckDiagnosis =
  /** The mint landed and the operation ran. Nothing to recover. */
  | { verdict: "already_succeeded" }
  /** The FXRP was minted but the operation was skipped; the nonce is stranded. */
  | { verdict: "nonce_stranded"; currentNonce: bigint }
  /** The payment is still sitting at the Core Vault. */
  | { verdict: "payment_stuck"; currentNonce: bigint };

/**
 * Decide what actually happened to a failed direct mint.
 *
 * The order of the checks matters. `isTransactionIdUsed` is the only reliable
 * signal that the XRP has been consumed — a revert on our side says nothing
 * about whether some other executor got there first. Only once that is known
 * does the nonce tell us whether the user operation ran or was skipped.
 */
export async function diagnose({
  xrplTxHash,
  personalAccount,
  expectedNonce,
}: {
  xrplTxHash: string;
  personalAccount: Address;
  expectedNonce: bigint;
}): Promise<StuckDiagnosis> {
  const controller = await getMasterAccountController();

  const [used, currentNonce] = await Promise.all([
    isTransactionIdUsed(xrplTxHash),
    publicClient.readContract({
      address: controller,
      abi: memoInstructionsFacetAbi,
      functionName: "getNonce",
      args: [personalAccount],
    }) as Promise<bigint>,
  ]);

  if (!used) return { verdict: "payment_stuck", currentNonce };

  // The mint happened. If the nonce moved past the slot our operation was
  // built for, the operation ran — by us or by another executor.
  if (currentNonce > expectedNonce) return { verdict: "already_succeeded" };

  return { verdict: "nonce_stranded", currentNonce };
}

/**
 * Validate a `0xE1` jump before it costs an XRPL payment.
 *
 * On-chain this reverts with `InvalidNonceIncrease`, which would strand yet
 * another payment. Checking here turns that into an error message.
 */
export function assertValidNonceIncrease(currentNonce: bigint, newNonce: bigint): void {
  if (newNonce <= currentNonce) {
    throw new Error(`New nonce ${newNonce} must be greater than the current nonce ${currentNonce}`);
  }
  if (newNonce - currentNonce > BigInt(0xffffffff)) {
    throw new Error("Nonce jump exceeds uint32 max");
  }
}
