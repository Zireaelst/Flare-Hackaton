# Tempo

**Programmable XRP. One payment away.**

Conditional and recurring execution for XRPL holders on Flare — triggered by a single XRPL
Payment, requiring no FLR, no EVM wallet, and no bridge.

> Built for the **Flare Summer Signal** hackathon (Bounty 1 — Interoperable Asset Products).
> Target network: **Coston2** testnet (chainId 114) + XRPL Testnet.

---

## The problem

XRPL can send a payment. It cannot say **"later"** and it cannot say **"if."** That is by
design — XRPL is a settlement ledger, not an execution environment.

Flare Smart Accounts closes the *authorization* gap: one XRPL Payment can trigger arbitrary
EVM logic through an EIP-4337 `PackedUserOperation`, with no FLR and no EVM wallet. But it
does not close the *time* gap — a user operation runs **once, immediately, atomically with the
mint**.

So for an XRP holder today, all of these are impossible on either chain:

- Dollar-cost average into a yield vault over ten weeks
- Take profit automatically when XRP crosses a price
- Stop-loss back to XRPL
- Deposit on a recurring schedule without ever touching Flare again

## What Tempo does

One XRPL payment authorizes a **standing order** instead of a single action. The order lives
on Flare, its conditions are evaluated on-chain against FTSO, and execution is
**permissionless** — the keeper is a convenience, never an authority.

| Order type | Trigger | Action |
|---|---|---|
| Schedule (DCA) | every `interval`, `slices` times | Deposit FXRP into a registered vault |
| Take-profit | FTSO `XRP/USD >= target` | Exit the vault, or redeem FXRP → XRP to XRPL |
| Stop-loss | FTSO `XRP/USD <= target` | Exit the vault, or redeem FXRP → XRP to XRPL |

**Flare solved getting in. Nobody solved getting out.** Smart Accounts v1.3 (28 July 2026)
already moves XRP into a curated vault with one XRPL signature, and 40M+ XRP has gone in that
way. Leaving still means noticing the moment yourself, sending another payment, waiting out the
vault's lag, and sending a third transaction to claim. One XRPL payment to Tempo sets up the
plan **and** the condition that unwinds it, and the keeper finishes both phases.

An order can always be cancelled, with another XRPL payment. `Tempo.cancel` requires the owner,
and the owner is the PersonalAccount — so there is no back door where a relayer could cancel on
someone's behalf, the same property that stops one creating orders for them. Cancelling moves
no funds: the FXRP never left the user's account and the allowance behind the order simply goes
unused.

Tempo also **automates the stuck-mint recovery protocol** (`0xE0` / `0xE1`) that users are
otherwise expected to drive by hand-crafting additional XRPL payments.

## How it works

```
1. Compose screen POSTs abi.encode(PackedUserOperation) to the relayer.

2. User sends ONE untagged XRPL Payment to the FAssets Core Vault:
   memo = 0xFE | walletId | executorFeeUBA | keccak256(userOp)   [42 bytes]

3. Relayer fetches an FDC XRPPayment attestation and calls
   AssetManager.executeDirectMintingWithData(proof, data).
   Atomically: FXRP is minted to the PersonalAccount, which runs
   [ FXRP.approve(Tempo, total), Tempo.createOrder(params) ].

4. Later, when conditions are met, ANYONE calls Tempo.execute(orderId).
   Tempo re-validates the trigger on-chain and pulls funds via the allowance.
```

The key idea: **the user operation registers an order rather than performing an action.** That
is how deferred execution is obtained from a primitive that has none.

## Flare integration

| Protocol | Role |
|---|---|
| **Smart Accounts** | Entry point. One XRPL payment, no FLR, no EVM wallet |
| **FAssets / FXRP** | The asset being scheduled; native redemption back to XRPL |
| **FTSO v2** | The price trigger itself — not decorative; remove it and two of three order types cease to exist |
| **FDC** | `XRPPayment` attestation proving the XRPL payment to Flare |

## Status

### 🔗 [tempo-three-orpin.vercel.app](https://tempo-three-orpin.vercel.app) — live demo

Contracts are live on Coston2 and exercised against the real FTSO feed, the real FXRP token,
and a real yield vault.

### Deployed contracts — Coston2 (chainId 114)

| Contract | Address |
|---|---|
| `Tempo` | [`0xe77A68818D9c75658D4c388996a9110d6B174870`](https://coston2-explorer.flare.network/address/0xe77A68818D9c75658D4c388996a9110d6B174870) |
| `VaultDepositAdapter` | [`0x332dA3E974DfAB81Ef1B1408B80989E5172046Fb`](https://coston2-explorer.flare.network/address/0x332dA3E974DfAB81Ef1B1408B80989E5172046Fb) |
| `VaultWithdrawAdapter` | [`0xb2cf8B3eAC04AC80c22Fbf3FBc7502E5E32499Bb`](https://coston2-explorer.flare.network/address/0xb2cf8B3eAC04AC80c22Fbf3FBc7502E5E32499Bb) |
| `RedeemAdapter` | [`0x3FA90083499BaF1229d65BD5B6E24A52CEF70176`](https://coston2-explorer.flare.network/address/0x3FA90083499BaF1229d65BD5B6E24A52CEF70176) |
| `SwapAdapter` | [`0x272E15fAc305a4dCdE8F5a9dEAac84288BC2A56C`](https://coston2-explorer.flare.network/address/0x272E15fAc305a4dCdE8F5a9dEAac84288BC2A56C) |

### Flare contracts Tempo builds on

| Contract | Address |
|---|---|
| `MasterAccountController` | `0x434936d47503353f06750Db1A444DBDC5F0AD37c` |
| `AssetManagerFXRP` | `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA` |
| FXRP | `0x0b6A3645c240605887a5532109323A3E12273dc7` |
| `FtsoV2` | `0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d` |
| Core Vault (XRPL) | `rDhpmiPq4BVBDWMVdSrmkgt8thKyRzGV1p` |

| | |
|---|---|
| Tests | 31, all passing — 23 unit, 5 against live Coston2, 3 against Flare mainnet |
| Day 0 gate | [Flare tx `0xa7649a73…`](https://coston2-explorer.flare.network/tx/0xa7649a730cd3e6c24f9f763a16e41618cb43c8f5df5a0dd36577dd84553bc1ca) — one XRPL payment minted FXRP **and** ran a user operation, atomically |
| First live order | [Flare tx `0x5170eca5…`](https://coston2-explorer.flare.network/tx/0x5170eca5681c235bddf200c5900d4fcc6eefc8201cc0a38e2453e7823bd2aa90) — one XRPL payment created a 2-slice DCA order |
| First execution | [Flare tx `0x70e08dbc…`](https://coston2-explorer.flare.network/tx/0x70e08dbc42c497d2255f1f0070258f991524e1c383440cb1c3a888c983dc136a) — the keeper deposited slice 1 into a live vault |

- Design spec: [`docs/specs/2026-08-03-tempo-design.md`](docs/specs/2026-08-03-tempo-design.md)
- Deployment record: [`docs/deployments.md`](docs/deployments.md)
- Chain constants and Day 0 findings: [`docs/coston2-constants.md`](docs/coston2-constants.md)

## Running it

```bash
git clone --recursive <repo> && cd <repo>

# Contracts
cd contracts
forge test                                                               # 17 unit tests, offline
COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc forge test    # + 5 fork tests

# App — landing page, demo console, relayer, keeper
cd ../web
cp .env.example .env.local        # then fill in the two secrets
npm install && npm run dev
```

The fork tests report as skipped without an RPC URL, so the default run stays offline and fast.

## Architecture

```
web/
  src/app/                landing page, demo console
  src/app/api/orders      compose an order and send the one XRPL payment
  src/app/api/relay       advance a relay by one step (stateless, poll-driven)
  src/app/api/keeper      execute due orders
  src/lib/flare/          Smart Accounts, FDC, chain clients
  src/lib/tempo/          order encoding, contract reads, keeper
contracts/                Foundry project — Tempo.sol, adapters, tests
.github/workflows/        keeper cron
```

Two design choices are worth calling out:

**The relayer keeps no state.** There is no database and no queue. A relay job is fully
described by the XRPL transaction plus the user-operation bytes its `0xFE` memo committed to,
and both are re-validated against the ledger on every step — destination, absence of a
destination tag, memo opcode, and `keccak256(data)` against the commitment. Tampering with a
job only breaks your own relay. This also means a relay survives a redeploy, a cold start, or
the browser being closed.

**Each relay step returns immediately.** FDC round finality takes minutes, well past a
serverless function's budget, so the caller polls rather than the function sleeping. The same
endpoint serves the browser and a cron job.

## Stuck-mint recovery

`executeDirectMintingWithData` is atomic: if anything reverts, the whole Flare transaction
rolls back — but the XRP has already left the user's wallet and is sitting at the Core Vault.
Nothing on Flare retries it. Smart Accounts documents a recovery protocol for exactly this, and
expects the user to drive it by hand-crafting further XRPL payments.

Tempo drives it automatically. On a revert the relayer diagnoses what actually happened from
on-chain state rather than guessing from the revert reason:

| On-chain state | What it means | Response |
|---|---|---|
| `isTransactionIdUsed` false | The payment is still at the Core Vault | `0xE0` skip-memo, then re-submit |
| used, and the nonce moved | Someone else executed it first | Report success |
| used, nonce unmoved | Minted, but the operation was skipped | `0xE1` fast-forward |
| `DirectMintingDelayed` | Rate-limited, not refused | Wait for `executionAllowedAt`, retry |

Two rules shape this. A **network error never triggers recovery** — recovery costs a real XRPL
payment, and spending one to fix a timeout is worse than the timeout. And the UI never suggests
resending: a second payment reuses the same nonce and strands itself too, which is the single
worst move available and the one users reach for first.

Verified on Coston2 by forcing a mint to revert (a user operation built against a deliberately
wrong nonce), then watching the relayer recover it unattended:

```
mint reverted (0x06427aeb)
  → diagnosed: payment stuck at the Core Vault
  → 0xE0 skip-memo payment F43B02F8…, its own FDC round 1417033
  → IgnoreMemoSet   0x37bff861…
  → original re-submitted, FXRP released to the personal account
  → a fresh order created normally afterwards (order #2)
```

`0xE2` (replace executor fee) is **not implemented**. Its byte layout is not published in any
source we could verify against, and guessing the layout of a memo that moves money is how funds
get stranded rather than recovered.

## Repository layout

```
web/             Next.js app — landing, demo, relayer, keeper
contracts/       Foundry project — Tempo.sol, adapters, tests
docs/specs/      design specs (Tempo current; Obscura archived)
docs/            chain constants, deployment record
.agents/skills/  vendored Flare AI skills
```

## License

TBD before submission.
