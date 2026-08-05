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
| Take-profit | FTSO `XRP/USD >= target` | Redeem FXRP → XRP to the user's XRPL address |
| Stop-loss | FTSO `XRP/USD <= target` | Redeem FXRP → XRP to the user's XRPL address |

Tempo also **automates the stuck-mint recovery protocol** (`0xE0` / `0xE1` / `0xE2`) that
users are otherwise expected to drive by hand-crafting additional XRPL payments.

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
| `Tempo` | [`0xdf0D7Be968D27E7533e3b15b7e854Ee2357Efdf7`](https://coston2-explorer.flare.network/address/0xdf0D7Be968D27E7533e3b15b7e854Ee2357Efdf7) |
| `VaultDepositAdapter` | [`0x7986aAC8d716970d1393bFF27bE4001DA52eb84a`](https://coston2-explorer.flare.network/address/0x7986aAC8d716970d1393bFF27bE4001DA52eb84a) |
| `RedeemAdapter` | [`0xE5005FDF2C8FCF6fb55F6014b69D0C68e4e66E85`](https://coston2-explorer.flare.network/address/0xE5005FDF2C8FCF6fb55F6014b69D0C68e4e66E85) |

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
| Tests | 17 unit + 5 fork, all passing |
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
