import "server-only";
import {
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseEventLogs,
  toHex,
  type Address,
  type TransactionReceipt,
} from "viem";
import { directMintingAbi, directMintingSettingsAbi, masterAccountControllerAbi, personalAccountAbi } from "./abis/flare";
import { dropsToXrp, xrpToDrops } from "xrpl";
import { publicClient, getAssetManagerFxrp, getMasterAccountController } from "./clients";
import { abi as memoInstructionsFacetAbi } from "./abis/memoInstructionsFacet";

export type Call = {
  target: Address;
  value: bigint;
  data: `0x${string}`;
};

const ZERO_BYTES32 = `0x${"00".repeat(32)}` as const;

/**
 * EIP-4337 PackedUserOperation. Only `sender`, `nonce` and `callData` are
 * validated on-chain; the rest exist to make the struct well-formed.
 */
const PACKED_USER_OPERATION_TUPLE = {
  type: "tuple",
  components: [
    { name: "sender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "initCode", type: "bytes" },
    { name: "callData", type: "bytes" },
    { name: "accountGasLimits", type: "bytes32" },
    { name: "preVerificationGas", type: "uint256" },
    { name: "gasFees", type: "bytes32" },
    { name: "paymasterAndData", type: "bytes" },
    { name: "signature", type: "bytes" },
  ],
} as const;

/** The deterministic Flare account an XRPL address controls. Exists before deployment. */
export async function getPersonalAccount(xrplAddress: string): Promise<Address> {
  return publicClient.readContract({
    address: await getMasterAccountController(),
    abi: masterAccountControllerAbi,
    functionName: "getPersonalAccount",
    args: [xrplAddress],
  });
}

/**
 * The memo-instruction nonce a new user operation must carry.
 *
 * Must be read once per XRPL payment and never reused across concurrent flows:
 * two payments built against the same nonce means one of them reverts and
 * strands its XRP at the Core Vault.
 */
export async function getNonce(personalAccount: Address): Promise<bigint> {
  return publicClient.readContract({
    address: await getMasterAccountController(),
    abi: memoInstructionsFacetAbi,
    functionName: "getNonce",
    args: [personalAccount],
  }) as Promise<bigint>;
}

/** The FAssets Core Vault XRPL address that direct-minting payments go to. */
export async function getCoreVaultXrplAddress(): Promise<string> {
  return publicClient.readContract({
    address: await getAssetManagerFxrp(),
    abi: directMintingAbi,
    functionName: "directMintingPaymentAddress",
  });
}

export function encodeUserOp({
  calls,
  sender,
  nonce,
}: {
  calls: Call[];
  sender: Address;
  nonce: bigint;
}): `0x${string}` {
  const callData = encodeFunctionData({
    abi: personalAccountAbi,
    functionName: "executeUserOp",
    args: [calls],
  });

  return encodeAbiParameters(
    [PACKED_USER_OPERATION_TUPLE],
    [
      {
        sender,
        nonce,
        initCode: "0x",
        callData,
        accountGasLimits: ZERO_BYTES32,
        preVerificationGas: 0n,
        gasFees: ZERO_BYTES32,
        paymasterAndData: "0x",
        signature: "0x",
      },
    ],
  );
}

/**
 * Build the 42-byte `0xFE` custom-instruction memo.
 *
 *   [ 0xFE | walletId(1) | executorFeeUBA(8) | keccak256(userOp)(32) ]
 *
 * The memo stays 42 bytes no matter how large the call batch is, because only
 * the hash travels on XRPL. The full bytes go to the executor off-chain, and
 * the controller checks keccak256(data) against this commitment before running
 * anything. Tempo's own user operation is ~1 KB, so the inline `0xFF` variant
 * would not fit.
 */
export function encodeCustomInstructionMemo({
  calls,
  sender,
  nonce,
  walletId = 0,
  executorFeeUBA = 0n,
}: {
  calls: Call[];
  sender: Address;
  nonce: bigint;
  walletId?: number;
  executorFeeUBA?: bigint;
}): { memoData: `0x${string}`; userOpData: `0x${string}`; userOpHash: `0x${string}` } {
  const userOpData = encodeUserOp({ calls, sender, nonce });
  const userOpHash = keccak256(userOpData);
  const memoData = concatHex([
    "0xFE",
    toHex(walletId, { size: 1 }),
    toHex(executorFeeUBA, { size: 8 }),
    userOpHash,
  ]);
  return { memoData, userOpData, userOpHash };
}

/**
 * How much XRP the payment must carry for `netMintAmountXrp` to actually be
 * minted.
 *
 * Fees come out of the payment, not on top of it, so this has to be computed
 * from the intended net mint. Getting it backwards silently under-mints.
 */
export async function computePaymentAmountXrp(netMintAmountXrp: number): Promise<number> {
  const assetManager = await getAssetManagerFxrp();
  const [executorFeeUBA, feeBIPS, minimumFeeUBA] = await Promise.all([
    publicClient.readContract({
      address: assetManager,
      abi: directMintingSettingsAbi,
      functionName: "getDirectMintingExecutorFeeUBA",
    }),
    publicClient.readContract({
      address: assetManager,
      abi: directMintingSettingsAbi,
      functionName: "getDirectMintingFeeBIPS",
    }),
    publicClient.readContract({
      address: assetManager,
      abi: directMintingSettingsAbi,
      functionName: "getDirectMintingMinimumFeeUBA",
    }),
  ]);

  const netMintUBA = BigInt(xrpToDrops(netMintAmountXrp));
  const proportionalFeeUBA = (netMintUBA * feeBIPS) / 10_000n;
  const mintingFeeUBA = proportionalFeeUBA > minimumFeeUBA ? proportionalFeeUBA : minimumFeeUBA;

  return Number(dropsToXrp((netMintUBA + mintingFeeUBA + executorFeeUBA).toString()));
}

/** Normalize an XRPL transaction hash to 0x-prefixed lowercase hex. */
export function normalizeXrplTxId(hash: string): `0x${string}` {
  return (hash.startsWith("0x") ? hash : `0x${hash}`).toLowerCase() as `0x${string}`;
}

/**
 * Find the `UserOperationExecuted` log on a direct-minting receipt.
 *
 * The controller runs the user operation synchronously inside
 * `executeDirectMintingWithData`, so its absence means the operation did not
 * run — most often because the AssetManager delayed the mint instead.
 */
export function findUserOperationExecuted(
  receipt: TransactionReceipt,
  personalAccount: Address,
  nonce: bigint,
) {
  const logs = parseEventLogs({
    abi: memoInstructionsFacetAbi,
    eventName: "UserOperationExecuted",
    logs: receipt.logs,
  });

  const match = logs.find((log) => {
    const args = log.args as { personalAccount: Address; nonce: bigint };
    return args.personalAccount.toLowerCase() === personalAccount.toLowerCase() && args.nonce === nonce;
  });

  if (!match) {
    throw new Error(
      `UserOperationExecuted not found on ${receipt.transactionHash} for ${personalAccount} nonce ${nonce}. ` +
        "The AssetManager may have delayed the mint — check for DirectMintingDelayed.",
    );
  }
  return match;
}
