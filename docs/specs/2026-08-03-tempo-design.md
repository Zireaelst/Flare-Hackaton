# Tempo — Design Spec

**Programmable XRP. One payment away.**

Conditional and recurring execution for XRPL holders on Flare, triggered by a single XRPL
Payment, requiring no FLR, no EVM wallet, and no bridge.

| | |
|---|---|
| Status | Approved, pre-implementation |
| Date | 2026-08-03 |
| Deadline | 2026-08-14 (judging 15–21 Aug, winners 24 Aug) |
| Team | Solo + Claude Code |
| Network | Coston2 (chainId 114) + XRPL Testnet |
| Bounty | 1 — Interoperable Asset Products |
| Budget | **$0.** No paid hosting, no credit card, no always-on machine of our own |

Supersedes `2026-08-03-obscura-design.md`, which is archived. Obscura required a continuously
running TEE stack; no free, card-free, always-on Docker host exists, and the judging window
runs a week past submission.

---

## 1. Thesis

XRPL can send a payment. It cannot say **"later"** and it cannot say **"if."** That is by
design — XRPL is a settlement ledger, not an execution environment.

Flare Smart Accounts closes the *authorization* gap: one XRPL Payment can now trigger
arbitrary EVM logic through an EIP-4337 `PackedUserOperation`, with no FLR and no EVM wallet.
But it does not close the *time* gap. A user operation executes **once, immediately, atomically
with the mint**. There is no deferral and no condition.

So for an XRP holder today, every one of these is impossible:

- Dollar-cost average into a yield vault over ten weeks
- Take profit automatically when XRP crosses a price
- Stop-loss out of a position back to XRPL
- Deposit on a recurring schedule without touching Flare again

Not "hard." Not "requires a dApp." **Impossible** — the primitive does not exist on either
chain.

**Tempo supplies the missing dimension.** One XRPL payment authorizes a *standing order*
instead of a single action. The order lives on Flare, its conditions are evaluated on-chain
against FTSO, and execution is permissionless.

### Why this is the right bet for these judges

The judges are the Flare team, and Flare's stated thesis is converting inert XRPL value into
active, composable value. The gap is stark: 880k+ Flare addresses against millions of XRP
holders who have never touched an EVM chain. Tempo's entire surface — Smart Accounts, FAssets,
FTSO — exists only on Flare. It cannot be ported.

---

## 2. The second problem: nobody handles failure

Roughly half of the Smart Accounts documentation is failure recovery, and that is the tell.

`executeDirectMintingWithData` is atomic: if anything reverts — wrong nonce, hash mismatch,
insufficient `msg.value`, any inner call failing — **no FXRP is minted, and the XRP is not
returned.** It sits at the Core Vault until someone drives a recovery.

Recovery is not automatic. The user is expected to hand-craft **more XRPL payments** carrying
special opcodes:

| Opcode | What the user must do |
|---|---|
| `0xE0` | Send a payment (with a positive mint amount) marking the stuck tx to be skipped, then have an executor re-submit the original |
| `0xE1` | Send another payment to fast-forward a nonce stranded on an abandoned operation |
| `0xE2` | Send another payment to replace the executor fee on a stuck transaction |

And the most common cause is mundane: **two XRPL payments sent in quick succession both read
the same `getNonce`.** One wins, the other reverts with `InvalidNonce` and strands its XRP.

A normal XRP holder will never execute this protocol. This is a documented, real, unglamorous
infrastructure problem that competitors building the happy path will not touch.

**Tempo automates the entire recovery protocol** and shows the user a plain-language timeline
of what happened. This is the difference between a demo and a product.

---

## 3. Product

**Target user:** XRP holders who want automated strategies without leaving XRPL. Secondary:
developers who want a public relayer and a reference implementation of the recovery protocol.

**What the user does:** sends one XRPL Payment. That is the entire interaction.

**What they get:** a standing order that runs on Flare — on a schedule, or when a price
condition is met — and that recovers itself when the mint path fails.

### v1 order types

| Type | Trigger | Action |
|---|---|---|
| **Schedule (DCA)** | every `interval` seconds, `slices` times | Deposit a slice of FXRP into a registered vault (Firelight / Upshift) |
| **Take-profit** | FTSO `XRP/USD >= target` | Redeem FXRP → XRP to the user's own XRPL address |
| **Stop-loss** | FTSO `XRP/USD <= target` | Redeem FXRP → XRP to the user's own XRPL address |

**FTSO is load-bearing, not decorative** — the price feed *is* the trigger. Remove FTSO and
two of the three order types cease to exist.

Actions deliberately avoid needing a DEX: vault deposits use registered vaults from
`MasterAccountController.getVaults()`, and redemption is native FAssets. No liquidity
assumptions, no testnet DEX dependency.

---

## 4. The core mechanism

The design problem: a user operation runs **once, atomically with the mint**. How do you get
deferred execution from a primitive with no deferral?

**Answer: make the user operation register an order rather than perform an action.**

```
1. XRPL user sends ONE Payment to the FAssets Core Vault
   memo = 0xFF | walletId | executorFeeUBA | abi.encode(PackedUserOperation)

2. Relayer sees the payment, fetches an FDC Payment attestation,
   calls AssetManager.executeDirectMinting(proof)

3. Atomically on Flare:
   - FXRP is minted to the user's PersonalAccount
   - PersonalAccount.executeUserOp([
         FXRP.approve(Tempo, totalAmount),
         Tempo.createOrder(orderParams)
     ])

4. Later — whenever conditions are met — ANYONE calls Tempo.execute(orderId).
   Tempo re-checks conditions on-chain, pulls FXRP from the PersonalAccount
   via the allowance, and performs the action.
```

**Why this is correct, not a trick:**

- Authorization happens exactly once, from the XRPL payment signature, exactly as Smart
  Accounts intends. `approve` executes with `msg.sender == PersonalAccount`, so the allowance
  is genuinely the user's.
- The user's exposure is bounded by the allowance and by the order parameters written at
  creation. Tempo cannot exceed either.
- `execute()` is **permissionless**. Our keeper is a convenience, not an authority. Conditions
  are validated on-chain, so a malicious or absent keeper cannot cause a wrong execution — only
  a late one. If every keeper dies, the user executes from the UI themselves.

That last property is the trust story, and it should be said out loud in the submission.

### Why `0xFF` and not `0xFE`

`0xFE` keeps the memo at a constant 42 bytes but requires delivering the `PackedUserOperation`
bytes to an executor **out of band** — a second channel, a second failure mode.

Our user operation is two calls (`approve` + `createOrder`) and fits comfortably inside XRPL's
~1024-byte memo cap. With `0xFF` the payment is fully self-describing: **any** indexer can
relay it via `executeDirectMinting(proof)`. Fewer moving parts, and a better decentralization
story — our relayer is not privileged and we publish it.

Fall back to `0xFE` only if a future order type outgrows the memo.

---

## 5. Architecture

```
 XRPL Testnet                      Relayer + Keeper                    Flare Coston2
 ────────────                      ────────────────                    ─────────────
 User's wallet
      │
      │ ONE Payment → Core Vault
      │ memo: 0xFF | ... | abi.encode(userOp)
      ▼
 ┌──────────┐   watch    ┌─────────────────────┐
 │ Core     │◄───────────│ relayer             │
 │ Vault    │            │ (GitHub Actions cron│   FDC proof
 └──────────┘            │  + Vercel route)    │──────────────┐
                         │  jobs in Supabase   │              ▼
                         └─────────────────────┘   AssetManager.executeDirectMinting
                                    │                          │
                                    │              ┌───────────┴───────────┐
                                    │              │ MasterAccountController│
                                    │              │  → PersonalAccount     │
                                    │              │     ├ FXRP.approve()   │
                                    │              │     └ Tempo.createOrder│
                                    │              └───────────┬───────────┘
                         ┌──────────▼──────────┐               │
                         │ keeper (cron 5 min) │               ▼
                         │ scans due orders    │──────► Tempo.sol
                         └─────────────────────┘        ├ FtsoV2 (trigger)
                                                        ├ transferFrom(PersonalAccount)
                                                        ├ vault deposit  │ FAssets redeem
                                                        └ recovery driver (0xE0/0xE1/0xE2)
                                    ▲
                         ┌──────────┴──────────┐
                         │ Next.js on Vercel   │  read-only chain state + timeline
                         └─────────────────────┘
```

### Hosting — all free, all card-free, all always-on

| Component | Host | Free-tier notes |
|---|---|---|
| `Tempo.sol` + adapters | Coston2 | Permanent once deployed |
| Frontend | **Vercel Hobby** | No card. Next.js + wagmi + viem |
| Relayer + keeper | **GitHub Actions cron (*/5 min)** | Free and unmetered on public repos. The repo is public anyway — and the workflow runs double as criterion-4 evidence |
| Redundant trigger | **cron-job.org** → Vercel API route | Free, no card. Independent second trigger |
| Job/recovery state | **Supabase free tier** | No card. Postgres for relay jobs, retry counters, recovery state |
| Keeper gas | Funded Coston2 hot key in GitHub Secrets | Testnet C2FLR from faucet |

> **Vercel Hobby cron only fires once per day** — that is why scheduling lives in GitHub
> Actions, not Vercel Cron. Two independent free triggers (Actions + cron-job.org) give
> redundancy through the 15–21 August judging window with nothing of ours running locally.

---

## 6. Contracts

### `Tempo.sol`

| Function | Notes |
|---|---|
| `createOrder(OrderParams)` | Called **by the PersonalAccount** inside `executeUserOp`. Records owner, XRPL address, type, trigger, action, amount, slices. |
| `execute(uint256 orderId)` | **Permissionless.** Re-validates trigger on-chain, pulls funds via allowance, dispatches the action, advances slice state. |
| `cancel(uint256 orderId)` | Callable by the PersonalAccount (i.e. by a later XRPL payment). Stops the order; remaining allowance is untouched and stays the user's. |
| `previewExecutable(uint256 orderId)` | View — keeper uses it to avoid wasting gas on reverting calls. |
| `dueOrders(uint256 from, uint256 count)` | View — paginated scan so the keeper needs no indexer. |

```solidity
struct OrderParams {
    OrderKind  kind;          // SCHEDULE | TAKE_PROFIT | STOP_LOSS
    ActionKind action;        // VAULT_DEPOSIT | REDEEM_TO_XRPL
    address    vault;         // for VAULT_DEPOSIT; must be in getVaults()
    bytes      xrplAddress;   // for REDEEM_TO_XRPL; the user's own XRPL address
    uint256    amountPerSlice;
    uint32     slices;
    uint64     intervalSeconds;   // SCHEDULE
    uint256    priceTarget;       // TAKE_PROFIT / STOP_LOSS, FTSO-scaled
    uint64     expiry;
}
```

**Invariants, each with a Foundry test:**

1. `execute()` reverts unless the trigger is genuinely satisfied on-chain — a lying keeper
   cannot force execution.
2. Total pulled across all executions never exceeds `amountPerSlice * slices`.
3. `execute()` cannot run twice for the same slice window.
4. After `expiry`, `execute()` always reverts; the allowance simply goes unused.
5. Only the owning PersonalAccount can `cancel`.
6. A stale FTSO feed reverts rather than executing on bad data.

### Action adapters

- `VaultDepositAdapter` — deposits into a vault from `MasterAccountController.getVaults()`.
  ERC-4626-shaped (Firelight / Upshift).
- `RedeemAdapter` — FAssets redemption back to the user's XRPL address. **Redemption is
  lot-aligned (1 lot = 10 FXRP)**, so `amountPerSlice` is validated against the current lot
  size at creation and any remainder is left in the PersonalAccount rather than silently lost.

### FTSO usage

Block-latency feeds (~1.8s) for `XRP/USD`. The contract reads the feed inside `execute()` and
enforces a freshness bound. Price triggers are evaluated **on-chain, at execution time** — the
keeper only points at the order; it never supplies the price.

---

## 7. Relayer and recovery

The relayer is a stateless worker, driven by cron, with its job state in Supabase.

### Happy path

1. Poll XRPL for payments to the Core Vault whose memo starts with `0xFF`
2. Decode the memo; sanity-check the `PackedUserOperation` (`sender` matches
   `getPersonalAccount(xrplAddress)`, `nonce == getNonce(personalAccount)`)
3. Request an FDC `Payment` attestation, wait for finality
4. Call `executeDirectMinting(proof)` with `msg.value == sum(call.value)` (zero for our calls)
5. Record the resulting Flare tx against the XRPL tx

### Recovery paths — the differentiator

| Detected state | Automated response |
|---|---|
| `DirectMintingDelayed` emitted | Wait until `executionAllowedAt`, re-submit. **Never** treat as hard failure or prompt a resend — a resend is what causes duplicate-nonce strandings |
| Mint reverted, `isTransactionIdUsed == false` | Drive `0xE0`: submit a skip-memo payment targeting the stuck tx id (with a positive net mint amount, since fee-only mints revert), then re-submit the original so FXRP is recovered without running the abandoned operation |
| Nonce stranded on an abandoned op, stuck tx already minted | Drive `0xE1` fast-forward. Validate client-side that `newNonce > getNonce` and the jump is `<= type(uint32).max` |
| Executor fee too low on a stuck payment | Drive `0xE2` replacement |
| Two user payments racing on one nonce | **Prevented, not recovered:** the relayer serializes per PersonalAccount and re-reads `getNonce` per payment |

The UI renders this as a plain timeline: *"Your payment is waiting on the network → recovering
a stuck mint → done."* The user never learns the word "nonce."

> Recovery opcodes send XRPL payments, which requires an XRPL key. **v1 scope:** Tempo drives
> recovery for orders created through its own flow using its operator wallet, and the UI
> surfaces a manual recovery path for payments made outside Tempo. Fully delegated recovery
> for third-party payments is roadmap.

---

## 8. Frontend

Next.js + wagmi + viem on Vercel. Built on `flare-viem-starter` patterns and, where useful,
`@flarenetwork/flare-wagmi-periphery-package`.

Four screens:

1. **Compose** — pick order type, amount, trigger. Produces the XRPL payment: a QR code, a
   `xrpl.org` deep link, and the raw memo hex. Shows the derived PersonalAccount address from
   `getPersonalAccount(xrplAddress)` *before* anything is sent.
2. **Timeline** — the plain-language status of a payment, including recovery states.
3. **Orders** — live orders, slices remaining, current FTSO price against the target, next due
   time. A **"Execute now"** button that calls `execute()` from the user's own wallet, proving
   the keeper is not privileged.
4. **Explain** — a short "what just happened" panel mapping the single XRPL payment to the
   Flare transactions it caused, with explorer links.

Screen 3's manual-execute button and screen 4 are what make the architecture legible to a
judge in 30 seconds.

---

## 9. Schedule

Today is 3 August. Deadline 14 August.

| Day | Date | Goal | Done when |
|---|---|---|---|
| 0 | 3 Aug | **Verify the whole stack is live on Coston2** — MasterAccountController, Core Vault, `getVaults()`, FDC verifier, XRPL testnet funding | A hand-built `0xFF` payment mints FXRP to a PersonalAccount |
| 1 | 4 Aug | Reproduce a minimal custom instruction end-to-end (`approve` + a counter increment) | `UserOperationExecuted` observed on Coston2 |
| 2 | 5 Aug | `Tempo.sol` skeleton + `createOrder` via user operation | Order created by one XRPL payment |
| 3 | 6 Aug | `execute()` + SCHEDULE orders + vault adapter | DCA slice executes; Foundry invariants 1–4 pass |
| 4 | 7 Aug | FTSO triggers + TAKE_PROFIT / STOP_LOSS + redeem adapter | Price-triggered redeem lands XRP back on XRPL |
| 5 | 8 Aug | Relayer happy path (GitHub Actions + Supabase jobs) | Payment → order, unattended |
| 6 | 9 Aug | **Recovery protocol** (`0xE0`, `0xE1`, serialized nonces) | Deliberately stuck mint recovers itself |
| 7 | 10 Aug | Frontend: compose, timeline, orders | Full flow in browser |
| 8 | 11 Aug | Deploy Vercel + cron redundancy; **laptop-off test** | Works for 12h with the laptop shut |
| 9 | 12 Aug | Rehearsal, edge cases, freeze addresses | Clean recordable run |
| 10 | 13 Aug | Demo video (3–4 min) + README + diagram | Video uploaded |
| 11 | 14 Aug | Distribution + buffer + **submit early** | Submitted |

**Day 0 is the gate.** If the Smart Accounts stack is not live and reachable on Coston2, we
learn it today, not on day 5. Designated sacrifices, in order: STOP_LOSS (keep TAKE_PROFIT),
`0xE2` recovery, frontend polish.

---

## 10. Demo

Three beats, in this order:

1. **One payment.** A phone, an XRPL testnet wallet, one Payment. Cut to Flare: FXRP minted,
   order live. No FLR was ever held, no EVM wallet was ever opened.
2. **It runs without us.** Time-lapse of DCA slices executing on schedule; then FTSO crosses
   the target and the take-profit redeems XRP back to the XRPL address. Laptop is closed.
3. **It survives failure.** Deliberately induce a stuck mint. Show the recovery driving
   `0xE0`/`0xE1` on its own, and the user-facing timeline explaining it in one sentence.

Beat 3 is the one competitors will not have.

---

## 11. Risks

| Risk | Handling |
|---|---|
| **Smart Accounts not fully live on Coston2** | Day 0 gate. If `getVaults()` is empty or Core Vault minting fails, fall back to §12 |
| FDC proof latency slower than expected | Relayer is async and retry-driven; UI shows "waiting on attestation" as a normal state |
| Vaults unavailable on testnet | Ship REDEEM_TO_XRPL first — it depends only on FAssets, not on third-party vaults |
| Lot-size rounding on redemption | Validate at creation; leave remainder in the PersonalAccount, never silently burn |
| Keeper gas exhaustion | Faucet top-ups; `execute()` is permissionless, so the user is never stuck |
| GitHub Actions cron drift/skips | cron-job.org as an independent second trigger; orders are time-window based, not exact-instant |
| XRPL testnet reset | Document the wallet regeneration path; keep test XRPL keys reproducible |

---

## 12. Fallback

If direct-minting custom instructions are not workable on Coston2, fall back to the
**proof-based flow** (`executeInstruction` with a 32-byte payment reference). It supports
`0x01` transfer, `0x02` redeem, and the Firelight/Upshift deposit instructions directly.

That yields a narrower product — scheduled and price-triggered execution over the *built-in*
instruction set rather than arbitrary calls — but the thesis, the UI, the keeper, and the FTSO
triggers all survive unchanged. Decide by **7 August**.

---

## 13. Out of scope for v1

Stated so scope creep has to argue against a written decision: DEX swaps, mainnet, non-XRP
FAssets, multi-order portfolios, notifications, mobile app, delegated recovery for third-party
payments, `0xFE` out-of-band delivery, LayerZero cross-chain settlement, any AI feature.

---

## 14. Roadmap (submission section)

1. **Public relayer as shared infrastructure** — anyone can run it; publish the image and the
   recovery driver as a library so other Smart Accounts apps stop reimplementing the happy path.
2. **Delegated recovery** for payments not created through Tempo.
3. **More triggers** — FDC `Web2Json` conditions (any HTTP JSON API as a trigger), FTSO custom
   feeds.
4. **More actions** — DEX swaps once testnet liquidity exists, cross-chain via FXRP as an OFT.
5. **Mainnet**, with an economic model for relayer fees using the existing `executorFeeUBA`
   field rather than a new token.

---

## 15. Working rules

1. **Day 0 gate first.** No `Tempo.sol` until one hand-built XRPL payment has minted FXRP into
   a PersonalAccount on Coston2.
2. **Commit 3–5 times a day with real messages.** "Evidence of new work" is scored and git
   history is the evidence.
3. **Never let the relayer prompt a user resend on a delayed mint.** That is the documented
   cause of duplicate-nonce strandings.
4. **Read `getNonce` once per payment**, and serialize relayer work per PersonalAccount.
5. **Treat every memo as untrusted input.** Decode strictly against the fixed layout; validate
   `sender`, `nonce`, and amounts before submitting anything on-chain.
6. **Every invariant in §6 has a Foundry test** before the corresponding UI exists.
7. **Cut features, never cut "it works."**
