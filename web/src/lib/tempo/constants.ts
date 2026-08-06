/** Safe to import from client components — nothing here is secret. */

export const EXPLORER = "https://coston2-explorer.flare.network";
export const XRPL_EXPLORER = "https://testnet.xrpl.org";

/**
 * The vaults Tempo's adapter allowlists, all registered on
 * `MasterAccountController` and all ERC-4626 over FXRP.
 */
export const VAULTS = [
  { address: "0xd91324a6e8884147f6425e9ddd60e11aea060b5b", symbol: "TESTstXRP" },
  { address: "0x9e63a5d282f2fbb7dce822b98e363b2719d28319", symbol: "TESTearnXRP" },
  { address: "0x4066a1363a04ce3b23eecb53defa65f94a24355e", symbol: "TESTstXRP (2)" },
  { address: "0xc90d6847747b85d1fa2e07859869fb9fb72c0361", symbol: "stXRP" },
] as const;

/** `Tempo.WHOLE_BALANCE` as it comes back from a contract read. */
export const WHOLE_BALANCE_STR = ((1n << 256n) - 1n).toString();

export const ORDER_KIND_LABEL = ["Schedule", "Take profit", "Stop loss"] as const;
export const ACTION_LABEL = ["Vault deposit", "Redeem to XRPL", "Exit vault"] as const;

export function shortAddress(address: string, size = 6): string {
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size)}…${address.slice(-4)}`;
}

export function formatFxrp(uba: string): string {
  return (Number(uba) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function formatUsd(wei: string): string {
  return `$${(Number(wei) / 1e18).toFixed(4)}`;
}

export function formatInterval(seconds: string): string {
  const value = Number(seconds);
  if (value === 0) return "—";
  if (value % 86_400 === 0) return `${value / 86_400}d`;
  if (value % 3_600 === 0) return `${value / 3_600}h`;
  if (value % 60 === 0) return `${value / 60}m`;
  return `${value}s`;
}

export function formatCountdown(unixSeconds: string): string {
  const delta = Number(unixSeconds) - Math.floor(Date.now() / 1000);
  if (delta <= 0) return "now";
  if (delta < 60) return `${delta}s`;
  if (delta < 3_600) return `${Math.ceil(delta / 60)}m`;
  if (delta < 86_400) return `${Math.ceil(delta / 3_600)}h`;
  return `${Math.ceil(delta / 86_400)}d`;
}
