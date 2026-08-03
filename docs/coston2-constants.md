# Coston2 constants

Read from chain on **2026-08-03**. Everything here was resolved through
`FlareContractsRegistry` at `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` (same address on all
Flare networks) — prefer resolving at runtime over hardcoding, and treat this file as a record
of what was live on Day 0, not as configuration.

RPC: `https://coston2-api.flare.network/ext/C/rpc` · chainId `114` ·
explorer `https://coston2-explorer.flare.network`

## Contracts

| Name | Address | Notes |
|---|---|---|
| `MasterAccountController` | `0x434936d47503353f06750Db1A444DBDC5F0AD37c` | Same on all Flare networks |
| `AssetManagerFXRP` | `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA` | |
| FXRP (FAsset token) | `0x0b6A3645c240605887a5532109323A3E12273dc7` | ERC-20 |
| `FtsoV2` | `0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d` | |

## XRPL

| | |
|---|---|
| Core Vault (direct-minting destination) | `rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p` |
| Smart Accounts operator wallet | `rEyj8nsHLdgt79KJWzXR5BgF7ZbaohbXwq` |
| Testnet WS | `wss://s.altnet.rippletest.net:51233` |

> **XRPL payments to smart accounts must be untagged.** A destination tag makes FAssets minting
> credit the tag holder, which lets a third party front-run the user operation.

## Direct-minting parameters

| Parameter | Value | In XRP |
|---|---|---|
| `lotSize` | `1e7` AMG | **10 XRP per lot** |
| `getDirectMintingMinimumFeeUBA` | `100000` | 0.1 XRP |
| `getDirectMintingFeeBIPS` | `25` | 0.25 % |
| `getDirectMintingExecutorFeeUBA` | `100000` | 0.1 XRP |
| `getDirectMintingOthersCanExecuteAfterSeconds` | `7200` | 2 hours |

Fees come **out of** the XRPL payment amount; only the remainder is minted. Compute the
required payment from the intended net mint, never the reverse.

The 2-hour `othersCanExecuteAfter` window is why our relayer must submit promptly — after it,
any third party may execute the direct mint.

## Smart Accounts registry state

| | |
|---|---|
| Registered vaults | 4 — ids `[4, 2, 3, 1]`, types `[2, 2, 2, 1]` |
| Vault addresses | `0xd91324a6e8884147f6425e9ddd60e11aea060b5b` (id 4)<br>`0x9e63a5d282f2fbb7dce822b98e363b2719d28319` (id 2)<br>`0x4066a1363a04ce3b23eecb53defa65f94a24355e` (id 3)<br>`0xc90d6847747b85d1fa2e07859869fb9fb72c0361` (id 1) |
| Registered agent vaults | 1 — `0x55c815260cbe6c45fe5bfe5ff32e3c7d746f14dc` |

Vault type enum still needs mapping to Firelight / Upshift.

## FTSO

| | |
|---|---|
| `XRP/USD` feed id | `0x015852502f55534400000000000000000000000000` |
| Reading on 2026-08-03 | value `1081318`, decimals `6` → **$1.081318** |

Feed is live and fresh on Coston2, so the price triggers are demonstrable on testnet.

## Memo formats — do not confuse these

| Purpose | Layout | Length |
|---|---|---|
| Plain direct mint to a Flare address | `4642505266410018` + `00000000` + recipient(20) | 32 bytes |
| Smart Accounts custom instruction (`0xFE`) | `0xFE` + walletId(1) + executorFeeUBA(8) + `keccak256(userOp)`(32) | 42 bytes |

## Known gaps

- Testnet XRP budget: 1 lot = 10 XRP, so a multi-slice DCA demo needs 100+ XRP funded on the
  XRPL testnet wallet.
- Vault type enum → protocol name mapping unverified.
- Whether direct minting enforces whole-lot amounts, or accepts arbitrary AMG, is unverified.
