import "server-only";
import { keccak256, parseEventLogs, type Address } from "viem";
import { directMintingAbi } from "../flare/abis/flare";
import type { Client as XrplClient } from "xrpl";
import { publicClient, getAssetManagerFxrp, relayerAccount, walletClient, withXrpl } from "../flare/clients";
import { getCoreVaultXrplAddress, normalizeXrplTxId } from "../flare/smartAccounts";
import { fetchProof, isRoundFinalized, prepareAttestationRequest, submitAttestationRequest } from "../flare/fdc";
import { tempoAbi } from "../tempo/abi";
import { config } from "../flare/config";
import type { RelayJob } from "./types";

/**
 * FDC's XRPPayment attestation needs the transaction buried under three
 * validated ledgers. `submitAndWait` only gets us one, so the relayer has to
 * wait for two more before the verifier will accept the request.
 * @see https://dev.flare.network/fdc/attestation-types/payment
 */
const REQUIRED_XRPL_CONFIRMATIONS = 3;

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
  const tx = await client.request({ command: "tx", transaction: job.xrplTxHash });
  const result = tx.result as unknown as {
    ledger_index?: number;
    tx_json?: { Destination?: string; DestinationTag?: number; Memos?: { Memo: { MemoData?: string } }[] };
    Destination?: string;
    DestinationTag?: number;
    Memos?: { Memo: { MemoData?: string } }[];
  };

  const destination = result.tx_json?.Destination ?? result.Destination;
  const destinationTag = result.tx_json?.DestinationTag ?? result.DestinationTag;
  const memos = result.tx_json?.Memos ?? result.Memos;

  const coreVault = await getCoreVaultXrplAddress();
  if (destination !== coreVault) {
    throw new Error(`Payment went to ${destination}, not the Core Vault ${coreVault}`);
  }

  // A destination tag makes FAssets credit the tag holder instead of the smart
  // account, which would hand someone else the mint.
  if (destinationTag !== undefined) {
    throw new Error("Payment carries a destination tag; smart-account payments must be untagged");
  }

  const memoHex = memos?.[0]?.Memo?.MemoData;
  if (!memoHex) throw new Error("Payment carries no memo");

  const memo = memoHex.toLowerCase();
  if (!memo.startsWith("fe")) throw new Error(`Memo opcode is 0x${memo.slice(0, 2)}, expected 0xFE`);
  if (memo.length !== 84) throw new Error(`Memo is ${memo.length / 2} bytes, expected 42`);

  const commitment = `0x${memo.slice(20)}`;
  const actual = keccak256(job.userOpData).toLowerCase();
  if (commitment !== actual) {
    throw new Error("Memo commitment does not match the supplied user operation");
  }

  return { ledgerIndex: result.ledger_index };
}

async function confirmations(client: XrplClient, txLedgerIndex: number): Promise<number> {
  const ledger = await client.request({ command: "ledger", ledger_index: "validated" });
  return ledger.result.ledger_index - txLedgerIndex + 1;
}

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
        return await awaitFinality(job);
      case "attesting":
        return await awaitRound(job);
      case "awaiting_proof":
        return await submitMint(job);
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

async function awaitFinality(job: RelayJob): Promise<RelayJob> {
  const { ledgerIndex, confirmed } = await withXrpl(async (client) => {
    const { ledgerIndex } = await validateJob(client, job);
    if (ledgerIndex === undefined) return { ledgerIndex: undefined, confirmed: 0 };
    return { ledgerIndex, confirmed: await confirmations(client, ledgerIndex) };
  });

  if (ledgerIndex === undefined || confirmed < REQUIRED_XRPL_CONFIRMATIONS) {
    return {
      ...job,
      message: `Confirming on the XRP Ledger (${Math.max(confirmed, 0)}/${REQUIRED_XRPL_CONFIRMATIONS})`,
    };
  }

  const abiEncodedRequest = await prepareAttestationRequest(normalizeXrplTxId(job.xrplTxHash));
  const roundId = await submitAttestationRequest(abiEncodedRequest);

  return {
    ...job,
    status: "attesting",
    abiEncodedRequest,
    roundId,
    message: `Flare is voting on your payment (round ${roundId})`,
  };
}

async function awaitRound(job: RelayJob): Promise<RelayJob> {
  if (job.roundId === undefined) throw new Error("attesting without a round id");

  if (!(await isRoundFinalized(job.roundId))) {
    return { ...job, message: `Flare is voting on your payment (round ${job.roundId})` };
  }
  return { ...job, status: "awaiting_proof", message: "Fetching the proof" };
}

async function submitMint(job: RelayJob): Promise<RelayJob> {
  if (!job.abiEncodedRequest || job.roundId === undefined) {
    throw new Error("awaiting proof without a request");
  }

  const proof = await fetchProof(job.abiEncodedRequest, job.roundId);
  if (!proof) return { ...job, message: "Fetching the proof" };

  const assetManager = await getAssetManagerFxrp();

  // Every call in Tempo's user operation carries zero value, so no msg.value is
  // forwarded and the PersonalAccount never needs C2FLR of its own.
  const hash = await walletClient().writeContract({
    account: relayerAccount(),
    chain: null,
    address: assetManager,
    abi: directMintingAbi,
    functionName: "executeDirectMintingWithData",
    args: [proof, job.userOpData],
    value: 0n,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") {
    return {
      ...job,
      status: "failed",
      flareTxHash: hash,
      message: "The mint reverted",
      error:
        "executeDirectMintingWithData reverted. The payment may already have been finalized by " +
        "another executor, or the nonce moved underneath this operation.",
    };
  }

  const orders = parseEventLogs({
    abi: tempoAbi,
    eventName: "OrderCreated",
    logs: receipt.logs,
  }).filter((log) => (log.address as Address).toLowerCase() === config.tempoAddress.toLowerCase());

  const orderId = orders[0]?.args.orderId;

  return {
    ...job,
    status: "done",
    flareTxHash: hash,
    orderId: orderId === undefined ? undefined : orderId.toString(),
    message: orderId === undefined ? "Minted, but no order was created" : `Order #${orderId} is live`,
  };
}
