# Deployments

## App — Vercel

**https://tempo-three-orpin.vercel.app**

| | |
|---|---|
| Project | `zireaelsts-projects/tempo` |
| Root directory | `web/` |
| Plan | Hobby (free) |

Deploy with `cd web && vercel --prod`.

> **Use the `tempo-three-orpin` alias, not the project-scoped URLs.** Vercel's deployment
> protection puts `tempo-*-zireaelsts-projects.vercel.app` behind SSO, so those return a 302 to
> a login page for anyone who is not the project owner — including hackathon judges. Only the
> generated public alias is reachable anonymously.

### Environment

Set for both production and preview via `vercel env add`:

| Variable | Notes |
|---|---|
| `RELAYER_PRIVATE_KEY` | Pays gas for FDC requests, the direct mint, and keeper executions |
| `DEMO_XRPL_SEED` | Signs the demo's XRPL payment |
| `KEEPER_SECRET` | Guards `/api/keeper`; verified returning 401 without it |
| `COSTON2_RPC_URL`, `XRPL_TESTNET_RPC_URL`, `TEMPO_ADDRESS`, `XRP_USD_FEED_ID` | Non-secret, set explicitly so the deployment does not silently fall back to defaults |

### Verified in production on 2026-08-05

- `/`, `/demo`, `/api/state` all 200, reading live FTSO and order state
- `/api/keeper` executed a real slice:
  [`0x4d4fa32a…`](https://coston2-explorer.flare.network/tx/0x4d4fa32ac5ea9a3823dbf57bb7df290919a16fff5e66a670ef07e3c0b31b02f8)
- `/api/keeper` without the bearer token returns 401

### Known exposure

`/api/orders` is unauthenticated. Anyone who finds the URL can make the demo wallet send XRP
and the relayer spend C2FLR. Order size is capped server-side (20 FXRP per slice, 5 slices,
40 FXRP total) but there is no rate limit. Both wallets are testnet-only and refillable from
public faucets, so the worst case is that the demo runs dry and needs topping up — but it is a
deliberate trade for a frictionless judge experience, not an oversight.

## Coston2 (chainId 114)

Deployed 2026-08-04 via `contracts/script/Deploy.s.sol`.

| Contract | Address |
|---|---|
| `Tempo` | `0x5cDE13104be89E7d4f95001DD428fAd6F27E7a10` |
| `VaultDepositAdapter` | `0xc7783B9e05da6A00d59E007Ad28f4A283141d1E6` |
| `VaultWithdrawAdapter` | `0x5D7AAB46950F56Ac423Cc4f16f9D5212257D9905` |
| `RedeemAdapter` | `0x0062CBa2B76c7D3E2Eb246b5EbddABE2d2A7387B` |
| `SwapAdapter` | `0xC63DD34Ed4a35196866A9cd6dB8c13E13eb5218d` |

Explorer: `https://coston2-explorer.flare.network/address/0x5cDE13104be89E7d4f95001DD428fAd6F27E7a10`

> Each redeployment orphans the previous one's orders. The constructor gains a
> parameter every time an action is added, so the adapters cannot be repointed
> at a new Tempo — that immutability is the point.

### The swap action is deployed but unusable on testnet

`SwapAdapter` is wired in, and it refuses. SparkDEX has no testnet deployment —
verified by reading code size at its published addresses on Coston2, Coston and
mainnet — so the adapter rejects `SWAP_TO_STABLE` orders at **creation** with
`SwapVenueUnavailable` rather than accepting them and failing weeks later at the
moment the user was relying on it.

It is proven against the real thing instead. `test/SwapMainnetFork.t.sol` runs
the adapter on a Flare mainnet fork: real FXRP, real USDT0, the real 0.05% pool
with ~4e11 liquidity, real fills. Nothing mocked.

```bash
FLARE_RPC_URL=https://flare-api.flare.network/ext/C/rpc forge test --match-contract SwapMainnetFork
```

The alternative was deploying a toy AMM to Coston2 and calling it a venue. A
swap against our own liquidity in our own pool would have demonstrated nothing
except that we can write an AMM.

### Vault withdrawals are two-phase

The registered FXRP vaults are not plain ERC-4626. `redeem` pays nothing — it
burns the shares and files a withdrawal against a daily period, released only
after the vault's lag. Read from `TESTstXRP` on Coston2:

| | |
|---|---|
| `lagDuration` | 300 seconds |
| `PERIOD_DURATION` | 86400 seconds |
| `withdrawalFee` | 0 |
| `claim(year, month, day, receiver)` | permissionless — pays the receiver, not the caller |

The keeper drives the second phase. Because `claim` names its receiver rather
than paying `msg.sender`, it can do so without any authority over the user.

Two things cost time to learn here, both worth not repeating:

- The date passed to `claim` must come from the **request's** period, not from
  `getWithdrawalEpoch()`. The latter reports the current epoch, which is not
  necessarily the one a given withdrawal was filed under.
- A claim inside the 300-second lag reverts with `0x085de625`. That looks like a
  permission problem and is not one; waiting is the whole fix.

### Constructor wiring

| Parameter | Value |
|---|---|
| `fxrp` | `0x0b6A3645c240605887a5532109323A3E12273dc7` |
| `ftsoV2` | `0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d` |
| `priceFeedId` | `0x015852502f55534400000000000000000000000000` (XRP/USD) |
| `maxPriceAge` | `300` seconds |

Allowlisted vaults (all four registered on `MasterAccountController`, all ERC-4626 over FXRP):

| Address | Symbol |
|---|---|
| `0xd91324a6e8884147f6425e9ddd60e11aea060b5b` | `TESTstXRP` |
| `0x9e63a5d282f2fbb7dce822b98e363b2719d28319` | `TESTearnXRP` |
| `0x4066a1363a04ce3b23eecb53defa65f94a24355e` | `TESTstXRP` |
| `0xc90d6847747b85d1fa2e07859869fb9fb72c0361` | `stXRP` |

> The vault **type** enum from `getVaults()` (`[2,2,2,1]`) does not separate Firelight from
> Upshift — `TESTstXRP` and `TESTearnXRP` share type `2`. It appears to denote integration
> kind rather than protocol, so Tempo allowlists by address and validates `asset() == FXRP`
> rather than trusting the type.

### Redeploying

```bash
set -a && . .env.local && set +a
cd contracts
forge script script/Deploy.s.sol:Deploy --rpc-url "$COSTON2_RPC_URL" --broadcast
```

Tempo and its adapters hold each other as immutables, so the script predicts Tempo's address
from the deployer nonce, constructs both adapters against it, then asserts the prediction held.
A nonce surprise aborts the run rather than leaving adapters pointed at an empty address.

### Notes

- Foundry warns that EIP-3855 (`PUSH0`) is unsupported on chain 114. This is Foundry not
  knowing the chain, not a real limitation — the deployed contracts read and execute fine.
- `deal()` does not work on FXRP. It is a proxy with its own supply accounting, so a forged
  balance underflows inside `transferFrom`. Fork tests impersonate a real holder instead.
