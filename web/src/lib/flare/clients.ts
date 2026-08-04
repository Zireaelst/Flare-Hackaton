import "server-only";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { flareTestnet } from "viem/chains";
import { assetManagerAbi, registryAbi } from "./abis/flare";
import { Client as XrplClient } from "xrpl";
import { config } from "./config";

export const publicClient = createPublicClient({
  chain: flareTestnet,
  transport: http(config.rpcUrl),
});

let cachedWalletClient: ReturnType<typeof createWalletClient> | null = null;

export function relayerAccount() {
  return privateKeyToAccount(config.relayerPrivateKey());
}

export function walletClient() {
  cachedWalletClient ??= createWalletClient({
    chain: flareTestnet,
    transport: http(config.rpcUrl),
  });
  return cachedWalletClient;
}

/**
 * Opens a fresh XRPL connection and always closes it.
 *
 * Serverless functions are frozen between invocations, so a cached WebSocket
 * comes back dead rather than warm. Connect per call and pay the handshake.
 */
export async function withXrpl<T>(fn: (client: XrplClient) => Promise<T>): Promise<T> {
  const client = new XrplClient(config.xrplWsUrl);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

// --- Contract resolution ----------------------------------------------------
//
// Addresses are resolved through FlareContractsRegistry rather than hardcoded,
// so a redeployment on Flare's side does not silently point Tempo at a dead
// contract. Resolution is cached per process because these effectively never
// change within one deployment's lifetime.

const addressCache = new Map<string, Address>();

export async function getContractAddress(name: string): Promise<Address> {
  const cached = addressCache.get(name);
  if (cached) return cached;

  const address = await publicClient.readContract({
    address: config.contractRegistry,
    abi: registryAbi,
    functionName: "getContractAddressByName",
    args: [name],
  });
  addressCache.set(name, address);
  return address;
}

export const getMasterAccountController = () => getContractAddress("MasterAccountController");
export const getAssetManagerFxrp = () => getContractAddress("AssetManagerFXRP");
export const getFtsoV2 = () => getContractAddress("FtsoV2");

export async function getFxrpAddress(): Promise<Address> {
  return publicClient.readContract({
    address: await getAssetManagerFxrp(),
    abi: assetManagerAbi,
    functionName: "fAsset",
  });
}
