export const SECTIONS = [
  { id: "problem", label: "The gap" },
  { id: "mechanism", label: "One payment → an order" },
  { id: "orders", label: "The order model" },
  { id: "execution", label: "Execution" },
  { id: "withdrawals", label: "Two-phase exits" },
  { id: "recovery", label: "Stuck-mint recovery" },
  { id: "relayer", label: "The relayer" },
  { id: "api", label: "HTTP API" },
  { id: "contracts", label: "Contracts" },
  { id: "running", label: "Running it" },
  { id: "limits", label: "Limits" },
] as const;

export const CONTRACTS = [
  { name: "Tempo", address: "0x5B281A91b54bd2E43f9f39A5AEF0CC7BbF15Fb6D" },
  { name: "VaultDepositAdapter", address: "0xfcBDC27153263A90FAa3ffed4aB25FACC6351a59" },
  { name: "VaultWithdrawAdapter", address: "0x48b4B2796f051041d393aD2d1B615D21419EC7de" },
  { name: "RedeemAdapter", address: "0x22eB0F7075481eCB8c3b544d8ee8101400e6a47A" },
  { name: "SwapAdapter", address: "0x47E5dEBF37a1201FB77a23E6C7872940C7b713fc" },
];

export const FLARE_CONTRACTS = [
  { name: "MasterAccountController", address: "0x434936d47503353f06750Db1A444DBDC5F0AD37c" },
  { name: "AssetManagerFXRP", address: "0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA" },
  { name: "FXRP", address: "0x0b6A3645c240605887a5532109323A3E12273dc7" },
  { name: "FtsoV2", address: "0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d" },
  { name: "Core Vault (XRPL)", address: "rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p" },
];
