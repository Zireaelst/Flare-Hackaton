import type { Address } from "viem";

export type RelayStatus =
  | "awaiting_xrpl_finality"
  | "attesting"
  | "awaiting_proof"
  | "executing"
  | "done"
  | "failed";

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

  /** Human-readable progress, safe to show a user verbatim. */
  message: string;
  error?: string;
};

/** What the UI shows for each status. Kept here so the API and page agree. */
export const STATUS_LABEL: Record<RelayStatus, string> = {
  awaiting_xrpl_finality: "Confirming your XRP payment",
  attesting: "Proving the payment to Flare",
  awaiting_proof: "Waiting for the proof to publish",
  executing: "Minting FXRP and creating your order",
  done: "Order created",
  failed: "Something went wrong",
};
