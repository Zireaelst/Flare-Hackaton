import type { Address } from "viem";

export type RelayStatus =
  | "awaiting_xrpl_finality"
  | "attesting"
  | "awaiting_proof"
  | "executing"
  | "delayed"
  | "recovering"
  | "retrying"
  | "done"
  | "failed";

/** What kind of recovery is in flight, if any. */
export type RecoveryKind = "skip_memo" | "fast_forward";

/**
 * A recovery payment's own trip through FDC.
 *
 * Recovery is not a special case of the pipeline — it is another XRPL payment
 * that needs its own attestation before it can do anything. Modelling it as a
 * nested leg keeps that honest instead of pretending it is instantaneous.
 */
export type RecoveryLeg = {
  kind: RecoveryKind;
  xrplTxHash: string;
  abiEncodedRequest?: `0x${string}`;
  roundId?: number;
  flareTxHash?: `0x${string}`;
  /** Set once the recovery payment itself has landed on Flare. */
  landed: boolean;
};

/**
 * Everything needed to resume a relay, carried by the caller between polls.
 *
 * The relayer is deliberately stateless. There is no database and no queue:
 * a job is fully described by the XRPL transaction plus the user-operation
 * bytes that the `0xFE` memo committed to, and both are re-validated against
 * the ledger on every step. That means a caller cannot make the relayer do
 * anything harmful by lying about this object — a forged `userOpData` fails
 * the on-chain `keccak256(data) == commitment` check, and a forged
 * `xrplTxHash` fails the destination and memo checks in `validateJob`.
 *
 * It also means the relay survives a redeploy, a cold start, or the browser
 * being closed and reopened, which a queue in process memory would not.
 */
export type RelayJob = {
  status: RelayStatus;

  /** The XRPL payment that carried the 42-byte 0xFE memo. */
  xrplTxHash: string;
  /** The full PackedUserOperation the memo committed to. */
  userOpData: `0x${string}`;
  personalAccount: Address;
  /** bigint serialized as a decimal string, because this crosses JSON. */
  nonce: string;

  /** Set once the FDC attestation has been requested. */
  abiEncodedRequest?: `0x${string}`;
  roundId?: number;

  /** Set once the mint has landed. */
  flareTxHash?: `0x${string}`;
  orderId?: string;

  /** Unix seconds. Set when the AssetManager rate-limited the mint. */
  executionAllowedAt?: number;

  /** Set when the original mint failed and recovery took over. */
  recovery?: RecoveryLeg;
  /** How many times recovery has been attempted, so it cannot loop forever. */
  recoveryAttempts?: number;

  /** Why the original mint reverted, kept for the operator once recovery starts. */
  revertReason?: string;

  /** Human-readable progress, safe to show a user verbatim. */
  message: string;
  error?: string;
};

/**
 * What the UI shows for each status.
 *
 * Deliberately in the user's language, not the protocol's. Someone watching a
 * recovery should never have to learn the word "nonce" to understand that
 * their money is being retrieved.
 */
export const STATUS_LABEL: Record<RelayStatus, string> = {
  awaiting_xrpl_finality: "Confirming your XRP payment",
  attesting: "Proving the payment to Flare",
  awaiting_proof: "Waiting for the proof to publish",
  executing: "Minting FXRP and creating your order",
  delayed: "The network rate-limited the mint — waiting",
  recovering: "Recovering your payment",
  retrying: "Retrying the mint",
  done: "Order created",
  failed: "Something went wrong",
};

/** The steps a normal relay walks through, in order. */
export const RELAY_STEPS: RelayStatus[] = [
  "awaiting_xrpl_finality",
  "attesting",
  "awaiting_proof",
  "executing",
  "done",
];
