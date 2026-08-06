/**
 * Server-side configuration. Every value that could differ between a local run
 * and a Vercel deployment lives here, read once, validated loudly.
 *
 * Nothing in this file may be imported from a client component — it reads
 * secrets.
 */
import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const config = {
  /** Coston2. `flareTestnet` in viem is this chain. */
  chainId: 114,
  rpcUrl: optional("COSTON2_RPC_URL", "https://coston2-api.flare.network/ext/C/rpc"),
  xrplWsUrl: optional("XRPL_TESTNET_RPC_URL", "wss://s.altnet.rippletest.net:51233"),

  /** Same address on every Flare network; everything else is resolved through it. */
  contractRegistry: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019" as const,

  tempoAddress: optional("TEMPO_ADDRESS", "0x5cDE13104be89E7d4f95001DD428fAd6F27E7a10") as `0x${string}`,

  /** XRP/USD block-latency feed. */
  xrpUsdFeedId: optional(
    "XRP_USD_FEED_ID",
    "0x015852502f55534400000000000000000000000000",
  ) as `0x${string}`,

  fdc: {
    verifierUrl: optional("VERIFIER_URL_TESTNET", "https://fdc-verifiers-testnet.flare.network/"),
    verifierApiKey: optional("VERIFIER_API_KEY_TESTNET", "00000000-0000-0000-0000-000000000000"),
    daLayerUrl: optional("COSTON2_DA_LAYER_URL", "https://ctn2-data-availability.flare.network/"),
    /** Coston2 uses the test source id; mainnet would be "XRP". */
    sourceId: optional("FDC_XRP_SOURCE_ID", "testXRP"),
  },

  /** Pays gas for FDC requests and for executeDirectMintingWithData. */
  relayerPrivateKey: () => required("RELAYER_PRIVATE_KEY") as `0x${string}`,

  /**
   * The demo's XRPL wallet. Judges do not have a funded XRPL testnet account,
   * so the demo signs the payment on their behalf and says so plainly in the UI.
   * A real user would sign this themselves in their own wallet.
   */
  demoXrplSeed: () => required("DEMO_XRPL_SEED"),
} as const;
