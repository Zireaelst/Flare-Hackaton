import "server-only";
import { decodeAbiParameters, toHex, type AbiParameter, type ContractFunctionArgs } from "viem";
import { fdcFeesAbi, fdcHubAbi, fdcVerificationAbi, relayAbi, systemsManagerAbi, xrpPaymentVerificationAbi } from "./abis/flare";
import { publicClient, getContractAddress, relayerAccount, walletClient } from "./clients";
import { config } from "./config";

export type XrpPaymentProof = ContractFunctionArgs<
  typeof xrpPaymentVerificationAbi,
  "view",
  "verifyXRPPayment"
>[0];

/**
 * The attestation type is `XRPPayment`, not the legacy generic `Payment`.
 * They have different response shapes and AssetManagerFXRP accepts only this one.
 */
const ATTESTATION_TYPE = "XRPPayment";

const xrpPaymentResponseAbiParam = (
  xrpPaymentVerificationAbi.find(
    (f) => f.type === "function" && "name" in f && f.name === "verifyXRPPayment",
  ) as { inputs: readonly { components?: readonly AbiParameter[] }[] } | undefined
)?.inputs?.[0]?.components?.[1];

function decodeXrpPaymentResponse(responseHex: `0x${string}`) {
  if (!xrpPaymentResponseAbiParam) {
    throw new Error("IXRPPayment.Response ABI not found on ixrpPaymentVerificationAbi");
  }
  const [decoded] = decodeAbiParameters([xrpPaymentResponseAbiParam], responseHex);
  return decoded;
}

/**
 * Ask the verifier to turn an XRPL transaction id into an attestation request.
 *
 * `proofOwner` binds the resulting proof to whoever will submit it. It must be
 * either the zero address or the exact account that calls
 * `executeDirectMintingWithData`, or the AssetManager rejects it.
 */
export async function prepareAttestationRequest(transactionId: `0x${string}`): Promise<`0x${string}`> {
  const url = `${config.fdc.verifierUrl.replace(/\/$/, "")}/verifier/xrp/XRPPayment/prepareRequest`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": config.fdc.verifierApiKey },
    body: JSON.stringify({
      attestationType: toHex(ATTESTATION_TYPE, { size: 32 }),
      sourceId: toHex(config.fdc.sourceId, { size: 32 }),
      requestBody: { transactionId, proofOwner: relayerAccount().address },
    }),
  });

  const body = await response.text();
  if (!response.ok) throw new Error(`FDC verifier returned ${response.status}: ${body}`);

  const data = JSON.parse(body) as { abiEncodedRequest?: string; status?: string; errorMessage?: string };
  if (data.status && !data.status.startsWith("OK") && data.status !== "VALID") {
    throw new Error(`FDC verifier rejected the request: ${data.status} ${data.errorMessage ?? ""}`);
  }
  if (!data.abiEncodedRequest) throw new Error(`FDC verifier response missing abiEncodedRequest: ${body}`);

  return data.abiEncodedRequest as `0x${string}`;
}

/** Submit the request on-chain and return the voting round it landed in. */
export async function submitAttestationRequest(abiEncodedRequest: `0x${string}`): Promise<number> {
  const fdcHub = await getContractAddress("FdcHub");
  const feeConfig = await publicClient.readContract({
    address: fdcHub,
    abi: fdcHubAbi,
    functionName: "fdcRequestFeeConfigurations",
  });
  const fee = await publicClient.readContract({
    address: feeConfig,
    abi: fdcFeesAbi,
    functionName: "getRequestFee",
    args: [abiEncodedRequest],
  });

  const hash = await walletClient().writeContract({
    account: relayerAccount(),
    chain: null,
    address: fdcHub,
    abi: fdcHubAbi,
    functionName: "requestAttestation",
    args: [abiEncodedRequest],
    value: fee,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

  const systemsManager = await getContractAddress("FlareSystemsManager");
  const [firstVotingRoundStartTs, votingEpochDurationSeconds] = await Promise.all([
    publicClient.readContract({
      address: systemsManager,
      abi: systemsManagerAbi,
      functionName: "firstVotingRoundStartTs",
    }),
    publicClient.readContract({
      address: systemsManager,
      abi: systemsManagerAbi,
      functionName: "votingEpochDurationSeconds",
    }),
  ]);

  return Number((BigInt(block.timestamp) - firstVotingRoundStartTs) / votingEpochDurationSeconds);
}

/** Whether the FDC voting round has finalized. Cheap enough to poll. */
export async function isRoundFinalized(roundId: number): Promise<boolean> {
  const [relay, fdcVerification] = await Promise.all([
    getContractAddress("Relay"),
    getContractAddress("FdcVerification"),
  ]);
  const protocolId = await publicClient.readContract({
    address: fdcVerification,
    abi: fdcVerificationAbi,
    functionName: "fdcProtocolId",
  });
  return publicClient.readContract({
    address: relay,
    abi: relayAbi,
    functionName: "isFinalized",
    args: [BigInt(protocolId), BigInt(roundId)],
  });
}

/**
 * Fetch the finalized proof from the DA layer.
 *
 * Returns null while the layer has not published it yet, so callers can poll
 * without treating "not ready" as an error.
 */
export async function fetchProof(
  abiEncodedRequest: `0x${string}`,
  roundId: number,
): Promise<XrpPaymentProof | null> {
  const url = `${config.fdc.daLayerUrl.replace(/\/$/, "")}/api/v1/fdc/proof-by-request-round-raw`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ votingRoundId: roundId, requestBytes: abiEncodedRequest }),
  });

  if (!response.ok) return null;

  const raw = JSON.parse(await response.text()) as {
    response_hex?: string;
    proof?: readonly `0x${string}`[];
  };
  if (!raw.response_hex) return null;

  return {
    merkleProof: raw.proof ?? [],
    data: decodeXrpPaymentResponse(raw.response_hex as `0x${string}`),
  } as XrpPaymentProof;
}
