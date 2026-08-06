import "server-only";
import { keccak256, parseEventLogs, type Address } from "viem";
import { directMintingAbi } from "../flare/abis/flare";
import { abi as memoInstructionsFacetAbi } from "../flare/abis/memoInstructionsFacet";
import type { Client as XrplClient } from "xrpl";
import { publicClient, getAssetManagerFxrp, relayerAccount, walletClient, withXrpl } from "../flare/clients";
import { getCoreVaultXrplAddress, normalizeXrplTxId } from "../flare/smartAccounts";
import { sendCoreVaultPayment } from "../flare/payments";
import {
  assertValidNonceIncrease,
  describeRevert,
  diagnose,
  isContractRevert,
  encodeFastForwardNonce,
  encodeSkipMemo,
  isPaymentAlreadyConfirmed,
  RECOVERY_NET_MINT_XRP,
} from "../flare/recovery";
import {
  fetchProof,
  isRoundFinalized,
  prepareAttestationRequest,
  submitAttestationRequest,
  type XrpPaymentProof,
} from "../flare/fdc";
import { tempoAbi } from "../tempo/abi";
import { config } from "../flare/config";
import type { RelayJob, RecoveryLeg } from "./types";

/**
 * FDC's XRPPayment attestation needs the transaction buried under three
 * validated ledgers. `submitAndWait` only gets us one, so the relayer has to
 * wait for two more before the verifier will accept the request.
 * @see https://dev.flare.network/fdc/attestation-types/payment
 */
const REQUIRED_XRPL_CONFIRMATIONS = 3;

/** One skip-memo and one nonce fast-forward is the whole recovery repertoire. */
const MAX_RECOVERY_ATTEMPTS = 2;

// --- XRPL validation --------------------------------------------------------

/**
 * Re-derive the job's claims from the XRP Ledger.
 *
 * This is what lets the relayer be stateless without being exploitable. Anyone
 * can POST a job, so before spending gas on an FDC request we confirm the
 * payment is real, went to the Core Vault, and carries a `0xFE` memo whose
 * commitment matches the user-operation bytes we were handed. A request that
 * fails any of these is refused before it costs anything.
 */
async function validateJob(client: XrplClient, job: RelayJob) {
  const { destination, destinationTag, memo, ledgerIndex } = await readPayment(client, job.xrplTxHash);

  const coreVault = await getCoreVaultXrplAddress();
  if (destination !== coreVault) {
    throw new Error(`Payment went to ${destination}, not the Core Vault ${coreVault}`);
  }

  // A destination tag makes FAssets credit the tag holder instead of the smart
  // account, which would hand someone else the mint.
  if (destinationTag !== undefined) {
    throw new Error("Payment carries a destination tag; smart-account payments must be untagged");
  }
  if (!memo) throw new Error("Payment carries no memo");
  if (!memo.startsWith("fe")) throw new Error(`Memo opcode is 0x${memo.slice(0, 2)}, expected 0xFE`);
  if (memo.length !== 84) throw new Error(`Memo is ${memo.length / 2} bytes, expected 42`);

  if (`0x${memo.slice(20)}` !== keccak256(job.userOpData).toLowerCase()) {
    throw new Error("Memo commitment does not match the supplied user operation");
  }

  return { ledgerIndex };
}

async function readPayment(client: XrplClient, xrplTxHash: string) {
  const tx = await client.request({ command: "tx", transaction: xrplTxHash });
  const result = tx.result as unknown as {
    ledger_index?: number;
    tx_json?: { Destination?: string; DestinationTag?: number; Memos?: { Memo: { MemoData?: string } }[] };
    Destination?: string;
    DestinationTag?: number;
    Memos?: { Memo: { MemoData?: string } }[];
  };

  const memos = result.tx_json?.Memos ?? result.Memos;
  return {
    ledgerIndex: result.ledger_index,
    destination: result.tx_json?.Destination ?? result.Destination,
    destinationTag: result.tx_json?.DestinationTag ?? result.DestinationTag,
    memo: memos?.[0]?.Memo?.MemoData?.toLowerCase(),
  };
}

async function confirmationsFor(xrplTxHash: string): Promise<number> {
  return withXrpl(async (client) => {
    const { ledgerIndex } = await readPayment(client, xrplTxHash);
    if (ledgerIndex === undefined) return 0;
    const ledger = await client.request({ command: "ledger", ledger_index: "validated" });
    return ledger.result.ledger_index - ledgerIndex + 1;
  });
}

// --- Shared FDC leg ---------------------------------------------------------

type FdcLeg = { xrplTxHash: string; abiEncodedRequest?: `0x${string}`; roundId?: number };

/**
 * Move one XRPL payment closer to having a usable FDC proof.
 *
 * Both the original payment and any recovery payment go through exactly this,
 * because a recovery payment is not privileged — it needs its own attestation
 * like any other.
 */
async function advanceToProof(
  leg: FdcLeg,
): Promise<{ leg: FdcLeg; proof: XrpPaymentProof | null; message: string }> {
  if (!leg.abiEncodedRequest) {
    const confirmed = await confirmationsFor(leg.xrplTxHash);
    if (confirmed < REQUIRED_XRPL_CONFIRMATIONS) {
      return {
        leg,
        proof: null,
        message: `Confirming on the XRP Ledger (${Math.max(confirmed, 0)}/${REQUIRED_XRPL_CONFIRMATIONS})`,
      };
    }

    const abiEncodedRequest = await prepareAttestationRequest(normalizeXrplTxId(leg.xrplTxHash));
    const roundId = await submitAttestationRequest(abiEncodedRequest);
    return {
      leg: { ...leg, abiEncodedRequest, roundId },
      proof: null,
      message: `Flare is voting on the payment (round ${roundId})`,
    };
  }

  if (leg.roundId === undefined) throw new Error("attestation requested without a round id");

  if (!(await isRoundFinalized(leg.roundId))) {
    return { leg, proof: null, message: `Flare is voting on the payment (round ${leg.roundId})` };
  }

  const proof = await fetchProof(leg.abiEncodedRequest, leg.roundId);
  return { leg, proof, message: proof ? "Proof ready" : "Fetching the proof" };
}

// --- Entry point ------------------------------------------------------------

/**
 * Advance a relay by one step and return the updated job.
 *
 * Deliberately non-blocking: each call does the smallest amount of work that
 * makes progress and returns. FDC round finality takes minutes, well past a
 * serverless function's budget, so the caller polls instead of the function
 * sleeping. The same design lets a cron job drive relays nobody is watching.
 */
export async function step(job: RelayJob): Promise<RelayJob> {
  try {
    switch (job.status) {
      case "awaiting_xrpl_finality":
      case "attesting":
      case "awaiting_proof":
        return await advanceMain(job);
      case "delayed":
        return await awaitDelay(job);
      case "recovering":
        return await advanceRecovery(job);
      case "retrying":
        return await retryOriginal(job);
      default:
        return job;
    }
  } catch (error) {
    return {
      ...job,
      status: "failed",
      message: "Relay failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// --- Main path --------------------------------------------------------------

async function advanceMain(job: RelayJob): Promise<RelayJob> {
  // Validate on the first step only; after that the payment is immutable and
  // re-reading it every poll would just burn XRPL requests.
  if (!job.abiEncodedRequest) {
    await withXrpl((client) => validateJob(client, job));
  }

  const { leg, proof, message } = await advanceToProof(job);

  if (!proof) {
    return {
      ...job,
      ...leg,
      status: leg.abiEncodedRequest ? "attesting" : "awaiting_xrpl_finality",
      message,
    };
  }

  return submitMint({ ...job, ...leg, status: "executing" }, proof);
}

async function submitMint(job: RelayJob, proof: XrpPaymentProof): Promise<RelayJob> {
  const assetManager = await getAssetManagerFxrp();

  let hash: `0x${string}`;
  try {
    // Every call in Tempo's user operation carries zero value, so no msg.value
    // is forwarded and the PersonalAccount never needs C2FLR of its own.
    hash = await walletClient().writeContract({
      account: relayerAccount(),
      chain: null,
      address: assetManager,
      abi: directMintingAbi,
      functionName: "executeDirectMintingWithData",
      args: [proof, job.userOpData],
      value: 0n,
    });
  } catch (error) {
    // viem estimates gas first, so a revert usually surfaces here rather than
    // as a failed receipt. Either way the XRP is stranded at the Core Vault and
    // recovery is the answer -- including for PaymentAlreadyConfirmed, which is
    // not a failure at all but another executor having got there first.
    //
    // A network error is deliberately not treated this way. Recovery costs a
    // real XRPL payment, and spending one to fix a timeout would be worse than
    // the timeout.
    if (!isContractRevert(error)) throw error;
    return startRecovery(job, describeRevert(error));
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === "reverted") {
    return startRecovery({ ...job, flareTxHash: hash }, "the mint transaction reverted");
  }

  // A rate-limited mint is deferred, not refused. Treating it as a failure is
  // what pushes users into resending a payment, which is the one action that
  // reliably strands funds.
  const delayed = parseEventLogs({
    abi: directMintingAbi,
    eventName: "DirectMintingDelayed",
    logs: receipt.logs,
  });
  if (delayed.length > 0) {
    const allowedAt = Number((delayed[0].args as { executionAllowedAt: bigint }).executionAllowedAt);
    return {
      ...job,
      status: "delayed",
      executionAllowedAt: allowedAt,
      message: "The network rate-limited this mint. It will go through automatically.",
    };
  }

  return succeed(job, hash, receipt.logs);
}

function succeed(job: RelayJob, hash: `0x${string}`, logs: readonly unknown[]): RelayJob {
  const orders = parseEventLogs({
    abi: tempoAbi,
    eventName: "OrderCreated",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logs: logs as any,
  }).filter((log) => (log.address as Address).toLowerCase() === config.tempoAddress.toLowerCase());

  const orderId = orders[0]?.args.orderId;

  if (orderId !== undefined) {
    return {
      ...job,
      status: "done",
      flareTxHash: hash,
      orderId: orderId.toString(),
      message: `Order #${orderId} is live`,
    };
  }

  if (job.intent === "cancel") {
    return {
      ...job,
      status: "done",
      flareTxHash: hash,
      message: "Order cancelled. Nothing moved — your FXRP never left your account.",
    };
  }

  // After a skip-memo recovery this is the expected outcome, not a fault:
  // 0xE0 exists precisely to release the FXRP *without* re-running the
  // operation that failed. Saying so plainly matters, because the alternative
  // reading -- "my money vanished" -- is what drives people to send a second
  // payment and strand that one too.
  const recovered = job.recovery?.kind === "skip_memo" && job.recovery.landed;

  return {
    ...job,
    status: "done",
    flareTxHash: hash,
    message: recovered
      ? "Your FXRP was recovered to your account. The order was not created — you can create it again."
      : "Minted, but no order was created",
  };
}

async function awaitDelay(job: RelayJob): Promise<RelayJob> {
  const now = Math.floor(Date.now() / 1000);
  const allowedAt = job.executionAllowedAt ?? now;

  if (now < allowedAt) {
    return { ...job, message: `Rate-limited — retrying in ${allowedAt - now}s` };
  }
  return { ...job, status: "retrying", message: "Retrying the mint" };
}

/** Re-submit the original payment, reusing the proof already published for it. */
async function retryOriginal(job: RelayJob): Promise<RelayJob> {
  if (!job.abiEncodedRequest || job.roundId === undefined) {
    throw new Error("cannot retry without the original attestation");
  }

  const proof = await fetchProof(job.abiEncodedRequest, job.roundId);
  if (!proof) return { ...job, message: "Fetching the proof" };

  return submitMint({ ...job, status: "executing" }, proof);
}

// --- Recovery ---------------------------------------------------------------

/**
 * Work out what went wrong and start putting it right.
 *
 * The three outcomes are genuinely different and only on-chain state can tell
 * them apart, so this never guesses from the revert reason alone.
 */
async function startRecovery(job: RelayJob, reason: string): Promise<RelayJob> {
  const attempts = job.recoveryAttempts ?? 0;
  if (attempts >= MAX_RECOVERY_ATTEMPTS) {
    return {
      ...job,
      status: "failed",
      message: "Recovery did not resolve this payment",
      error: `Gave up after ${attempts} recovery attempts (${reason}). The XRP is at the Core Vault and can still be recovered by hand.`,
    };
  }

  const verdict = await diagnose({
    xrplTxHash: job.xrplTxHash,
    personalAccount: job.personalAccount,
    expectedNonce: BigInt(job.nonce),
  });

  if (verdict.verdict === "already_succeeded") {
    return {
      ...job,
      status: "done",
      message: "This payment was already processed",
    };
  }

  if (verdict.verdict === "payment_stuck") {
    // 0xE0: mark the stuck payment's memo to be skipped, so a re-submission
    // mints the FXRP without re-running the operation that failed.
    const memoData = encodeSkipMemo({ targetTxId: job.xrplTxHash });
    const { xrplTxHash } = await sendCoreVaultPayment({
      memoData,
      netMintXrp: RECOVERY_NET_MINT_XRP,
    });

    return {
      ...job,
      status: "recovering",
      recoveryAttempts: attempts + 1,
      recovery: { kind: "skip_memo", xrplTxHash, landed: false },
      message: "Recovering your payment from the vault",
      error: undefined,
      revertReason: reason,
    };
  }

  // nonce_stranded: the FXRP is already minted but the operation was skipped,
  // so the nonce still points at a slot nothing will ever fill. 0xE1 moves it.
  const newNonce = verdict.currentNonce + 1n;
  assertValidNonceIncrease(verdict.currentNonce, newNonce);

  const { xrplTxHash } = await sendCoreVaultPayment({
    memoData: encodeFastForwardNonce({ newNonce }),
    netMintXrp: RECOVERY_NET_MINT_XRP,
  });

  return {
    ...job,
    status: "recovering",
    recoveryAttempts: attempts + 1,
    recovery: { kind: "fast_forward", xrplTxHash, landed: false },
    message: "Unblocking your account",
    error: undefined,
    revertReason: reason,
  };
}

async function advanceRecovery(job: RelayJob): Promise<RelayJob> {
  const recovery = job.recovery;
  if (!recovery) throw new Error("recovering without a recovery leg");

  const { leg, proof, message } = await advanceToProof(recovery);
  const updated: RecoveryLeg = { ...recovery, ...leg };

  if (!proof) return { ...job, recovery: updated, message };

  const assetManager = await getAssetManagerFxrp();

  let hash: `0x${string}`;
  try {
    // Recovery payments carry no user operation, so `_data` is empty.
    hash = await walletClient().writeContract({
      account: relayerAccount(),
      chain: null,
      address: assetManager,
      abi: directMintingAbi,
      functionName: "executeDirectMintingWithData",
      args: [proof, "0x"],
      value: 0n,
    });
  } catch (error) {
    // Flare runs its own executor against the Core Vault, so ours is not the
    // only one watching. Losing that race means the recovery payment has
    // already been applied and the skip flag is already set -- exactly the
    // outcome we wanted, reached by someone else. Treating it as a failure
    // here would abandon a payment that is in fact fine.
    if (!isPaymentAlreadyConfirmed(error)) throw error;
    return advanceAfterRecovery(job, { ...updated, landed: true });
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") {
    return {
      ...job,
      status: "failed",
      recovery: { ...updated, flareTxHash: hash },
      message: "Recovery failed",
      error: `The ${recovery.kind === "skip_memo" ? "skip-memo" : "nonce fast-forward"} recovery reverted (${hash}).`,
    };
  }

  // Confirm the recovery actually did what it claims. The skip flag and the
  // nonce jump each emit a specific event; without one, re-submitting would
  // just reproduce the original failure.
  const expectedEvent = recovery.kind === "skip_memo" ? "IgnoreMemoSet" : "NonceIncreased";
  const emitted = parseEventLogs({
    abi: memoInstructionsFacetAbi,
    eventName: expectedEvent,
    logs: receipt.logs,
  });
  if (emitted.length === 0) {
    return {
      ...job,
      status: "failed",
      recovery: { ...updated, flareTxHash: hash },
      message: "Recovery did not take effect",
      error: `Expected a ${expectedEvent} event on ${hash} and found none.`,
    };
  }

  return advanceAfterRecovery(job, { ...updated, flareTxHash: hash, landed: true });
}

/** Where a relay goes once its recovery payment has taken effect. */
function advanceAfterRecovery(job: RelayJob, recovery: RecoveryLeg): RelayJob {
  if (recovery.kind === "fast_forward") {
    // Nothing left to re-submit: the FXRP was already minted, and the account
    // is now usable again for future orders.
    return {
      ...job,
      status: "done",
      recovery,
      message: "Your FXRP was recovered and your account is unblocked",
    };
  }

  return {
    ...job,
    status: "retrying",
    recovery,
    message: "Recovered — retrying the mint",
  };
}
