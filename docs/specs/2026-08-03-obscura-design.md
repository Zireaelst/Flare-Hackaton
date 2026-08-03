> **⚠️ SUPERSEDED (2026-08-03) by [`2026-08-03-tempo-design.md`](./2026-08-03-tempo-design.md).**
> Obscura requires a continuously running TEE stack. No free, card-free, always-on Docker host
> exists, and the judging window runs a week past submission — so the demo would be dead
> whenever the developer's laptop was closed. Kept for reference; the analysis remains valid
> if FCC is revisited with a hosting budget.

# Obscura — Design Spec

**Sealed-bid auction infrastructure for FXRP and XRPL-originated assets, built on Flare Confidential Compute.**

| | |
|---|---|
| Status | Approved, pre-implementation |
| Date | 2026-08-03 |
| Deadline | 2026-08-14 (judging 15–21 Aug, winners 24 Aug) |
| Team | Solo + Claude Code |
| Network | Coston2 testnet (chainId 114) |
| Bounties | 2 — Confidential Compute (primary) · 1 — Interoperable Assets (secondary) |

---

## 1. Thesis

A Vickrey (second-price sealed-bid) auction is **mathematically impossible on a public
blockchain**. The mechanism's incentive compatibility depends on bids being unobservable
until clearing. If bids are visible in the mempool or in contract storage, truthful bidding
stops being a dominant strategy and the mechanism collapses into something else.

This is not a product that Flare Confidential Compute makes *easier*. It is a product that
cannot exist without it. A smart contract alone cannot approximate it — commit-reveal leaks
through non-revelation, and any on-chain reveal is a reveal.

Flare's own FCC documentation names this use case directly when explaining when to reach for
a TEE: *"sealed-bid auctions, private order matching."* Obscura is that sentence, shipped.

### Why the problem is real

Tokenized RWA value on XRPL has reached roughly $4.18B, up ~28x year over year. But most of it
is **represented, not distributed** — recorded on-chain, not freely transferable. At one
measurement of ~$2.3B total, ~$1.49B was represented, the ledger showed ~22 RWA holders, and
30-day transfer volume had fallen ~91% to ~$10M.

Assets exist. Liquidity does not. One structural reason: **institutional sellers will not
publish price and position on an open order book.** Revealing intent on a large block moves
the price against you before you trade. That rules out the market structures a public chain
can offer, and it is precisely the class of mechanism confidential compute re-enables.

> Figures are directional and vary by source and date. Verify before quoting in the submission.

---

## 2. Product

**Obscura** is auction infrastructure, not a marketplace. The deliverable is a Flare Compute
Extension plus the on-chain contracts and a reference dApp that drives it.

- **Target user (v1):** OTC desks and institutional holders moving large FXRP or
  XRPL-originated RWA blocks without leaking intent.
- **Target user (roadmap):** FAssets agents facing liquidation. See §11.
- **Settlement asset:** FXRP (Coston2 faucet supplies it, so flows are real, not mocked).

### Scope decision

The engine is a **generic sealed-bid auction**. The demo scenario is **OTC block sale**.
FAssets liquidation is designed for but **not built** in v1 — the contract exposes an
`ILiquidationSource` adapter interface so the integration is a real seam in code, not a
promise in a README.

Rationale: liquidation framing scores higher on judging criterion 1 (usefulness), but binds
us to the FAssets `AssetManager` liquidation surface, which is an unknown integration cost
inside an 11-day budget. Criterion 3 ("does the demo work") outranks criterion 1 when they
conflict. Revisit 7 August — if days 1–2 run ahead of schedule, promote it.

---

## 3. Confidentiality model

This section is the core of the design. Everything else is plumbing.

### What is hidden

| Value | Visibility |
|---|---|
| Individual bid amounts | **Never revealed**, including after settlement |
| Reserve price | **Never revealed** |
| What losers bid | **Never revealed** |
| Clearing price (2nd price) | Revealed at settlement — it is the price paid |
| Winner address | Revealed at settlement |
| Bidder addresses | Public (they transact on-chain) |
| Bid count | Public |
| Bid timing | Public |

### The escrow leak — and the fix

**This is the failure mode that would invalidate the entire product, so it is designed for
explicitly.**

The naive design has each bidder escrow collateral proportional to their bid. That destroys
confidentiality completely: an observer ignores the ciphertext and reads the `Transfer`
amount. ECIES becomes decoration.

**Fix — uniform bid tickets.** The seller sets a single `ticketAmount` at auction creation.
*Every* bidder deposits exactly `ticketAmount` of the settlement asset to participate. The
encrypted bid must be `<= ticketAmount`; the TEE rejects bids that exceed it.

- On-chain, every participant's escrow is byte-identical. The deposit carries zero information.
- At settlement the winner pays `clearingPrice` (the second-highest bid) and is refunded
  `ticketAmount - clearingPrice`. Losers are refunded in full.
- Cost: bids are capped at `ticketAmount`, and bidders over-escrow. This is standard for
  sealed-bid deposits and is an honest, explainable trade-off.

### Residual leakage — stated, not hidden

Acknowledged in the submission rather than papered over:

1. **Timing.** Bid submission order and timestamps are public. A determined observer learns
   who bid when, not what.
2. **Participation.** Bidder identity is public. Obscura hides *values*, not *presence*.
3. **Refund amounts at settlement.** The winner's refund is `ticketAmount - clearingPrice`,
   and `clearingPrice` is public anyway, so no additional leak. Losers all receive identical
   refunds.
4. **Single TEE.** v1 routes to one TEE machine. That machine is trusted for confidentiality
   (not for integrity — integrity is signature-verified on-chain). Mitigation path in §11.

### Trust boundary

- **Integrity is not trusted.** The result is signed by the TEE identity key and verified
  on-chain against `TeeMachineRegistry` before any asset moves. A dishonest result cannot
  settle.
- **Confidentiality is trusted to the enclave.** In v1 with `SIMULATED_TEE=true` the
  attestation is simulated. This is stated plainly in the submission; real GCP Confidential
  Space attestation is a deployment change, not a product change (§10).

---

## 4. Architecture

```
 XRPL user                       Flare (Coston2)                          TEE machine
 ─────────                       ───────────────                          ───────────
 XRPL Payment ──memo(0xFF)──► MasterAccountController        (stretch, day 7)
                                     │
                                     ▼
 EVM user ──────────────────► AuctionHouse.sol
                              ├─ escrow: uniform bid tickets (FXRP)
                              ├─ FTSO: USD→FXRP rate at close
                              ├─ ILiquidationSource (interface only, v1)
                              └─ sendInstructions() ──► TeeExtensionRegistry
                                                              │
                                                     data providers (≥50% weight)
                                                              │
                                                          ext-proxy
                                                              │
                                                          extension-tee
                                                       ┌──────┴───────┐
                                                       │ ECIES decrypt│
                                                       │ Vickrey clear│
                                                       │ commitments  │
                                                       └──────┬───────┘
                                     ┌────────────────────────┘
                                     ▼           (TEE node signs the ActionResult)
                              AuctionHouse.settle(result, actionId, tag, status, sig)
                              └─ recover signer == teeAddress → transfer FXRP, refund losers
```

### Instruction lifecycle

Obscura owns exactly two things: the on-chain contract (step 1) and the action handler
(step 6). Everything between is Flare infrastructure.

1. User calls `AuctionHouse` (our `InstructionSender`)
2. Contract calls `TeeExtensionRegistry.sendInstructions()` → emits `TeeInstructionsSent`
3. `ext-proxy` picks the instruction off-chain
4. TEE node fetches it from the proxy
5. TEE node delivers it as `POST /action` to our extension
6. Handler decodes, validates, executes, returns `[dataHex, status, error]`
7. TEE node signs the `ActionResult` with its identity key
8. Caller polls the proxy for the signed result and submits it to `settle()`

---

## 5. FCE command set

`OP_TYPE_AUCTION = bytes32("AUCTION")`

| opCommand | Payload | Behavior | Returns |
|---|---|---|---|
| `CREATE` | `auctionId`, ECIES(reserve price, USD) | Store reserve in enclave keyed by `auctionId` | status only |
| `BID` | `auctionId`, ECIES(bid amount) | Decrypt, validate `<= ticketAmount`, store | status only — never the amount |
| `CLOSE` | `auctionId`, `usdPerFxrp` (from FTSO) | Convert reserve, run Vickrey clearing, build commitment | ABI-encoded signed result |
| `STATE` | `auctionId` | Bid **count** only | count, never amounts |

> **The three-layer string rule.** `opType`/`opCommand` must match byte-for-byte across
> `AuctionHouse.sol` (`bytes32("AUCTION")`), `typescript/src/app/config.ts`, and the handler
> registration in `register()`. A mismatch surfaces as `unsupported op type` /
> `unsupported op command`. `bytes32` holds 31 bytes — keep identifiers short.

### Clearing algorithm (`CLOSE`)

```
bids  := decrypted bids for auctionId          // enclave memory
valid := [b in bids where b >= reserveFxrp]    // reserveFxrp = reserveUsd / usdPerFxrp
if len(valid) == 0        -> NO_SALE
if len(valid) == 1        -> winner = valid[0], clearingPrice = reserveFxrp   // reserve as 2nd price
else                      -> sort desc; winner = valid[0], clearingPrice = valid[1]
```

Reserve-as-second-price for the single-valid-bid case is the standard Vickrey-with-reserve
rule. Ties: earliest submission wins (deterministic, and timing is public anyway).

### Result payload

```solidity
abi.encode(
    uint256 auctionId,
    uint8   outcome,          // 0 = NO_SALE, 1 = SOLD
    address winner,
    uint256 clearingPrice,
    uint32  bidCount,
    bytes32 bidsCommitment    // keccak over (bidder, keccak(ciphertext)) pairs, submission order
)
```

`bidsCommitment` gives **inclusion receipts**: any bidder can recompute the commitment from
public ciphertexts and confirm their bid was counted. This answers "why should I trust the
enclave counted me" without revealing any amount.

---

## 6. Contracts

### `AuctionHouse.sol` (is the `InstructionSender`)

Modeled on `fce-weather-insurance`'s `WeatherInsurance.sol`, which is the closest working
reference for escrow + TEE-signature-verified settlement.

| Function | Notes |
|---|---|
| `createAuction(asset, qty, ticketAmount, bidDeadline, reserveCiphertext)` | Seller escrows the asset. Emits `AuctionCreated`. Sends `AUCTION/CREATE`. `payable` — forwards instruction fee. |
| `placeBid(auctionId, bidCiphertext)` | Pulls exactly `ticketAmount`. Rejects duplicates and post-deadline bids. Sends `AUCTION/BID`. `payable`. |
| `closeAuction(auctionId)` | After `bidDeadline`. Reads FTSO, sends `AUCTION/CLOSE` with the rate. `payable`. |
| `settle(auctionId, resultData, actionId, submissionTag, status, signature)` | Verifies TEE signature, then moves assets. Permissionless. |
| `cancelAuction(auctionId)` | After `bidDeadline + SETTLEMENT_WINDOW` if unsettled. Refunds every ticket, returns the asset to the seller. |
| `setExtensionId()` | Set-once. Scans `TeeExtensionRegistry` from `0x10000` (first public extension ID) to `nextPublicExtensionId()`. |

### TEE signature verification — exact form

**The single most likely place to lose hours.** The TEE node does *not* sign the raw result
hash; it signs a domain-separated payload with an EIP-191 prefix. Verifying against
`resultHash` directly silently recovers a wrong address.

```solidity
bytes32 resultHash = keccak256(abi.encodePacked(
    keccak256(_resultData), _actionId, keccak256(bytes(_submissionTag)), _status));

bytes32 payloadHash = keccak256(abi.encode(
    bytes32("TEE_ACTION_RESULT"), block.chainid, resultHash));

address signer = _recover(_ethSigned(payloadHash), _signature);  // EIP-191 personal-sign
require(signer == teeAddress, "bad TEE signature");
require(_status == 1, "TEE result not successful");
```

Only `status == 1` results are accepted. Copy this from `WeatherInsurance.sol` rather than
deriving it.

### `ILiquidationSource` (interface only in v1)

```solidity
interface ILiquidationSource {
    function collateralFor(uint256 auctionId) external view returns (address asset, uint256 qty);
    function onAuctionSettled(uint256 auctionId, address winner, uint256 clearingPrice) external;
}
```

Documents the FAssets liquidation seam without taking on the integration in v1.

---

## 7. Failure modes

| Failure | Handling |
|---|---|
| **TEE restarts mid-auction** — enclave memory is not persistent, so stored bids are lost | `cancelAuction()` after `bidDeadline + SETTLEMENT_WINDOW` refunds every ticket and returns the asset. **This is a correctness requirement with a Foundry test, not a caveat.** |
| Bid exceeds `ticketAmount` | TEE rejects at `BID` time, returns error status. Ticket is refundable via cancel/settle. |
| No bid clears the reserve | `outcome = NO_SALE`. Asset returns to seller, all tickets refunded. |
| Instruction never reaches the TEE | Same timeout path as TEE restart. |
| Duplicate bid from one address | Rejected on-chain in `placeBid`. |
| FTSO feed stale at close | Contract requires feed freshness; otherwise close reverts and the timeout path applies. |
| Seller never calls `closeAuction` | `closeAuction` is permissionless after the deadline. |

---

## 8. Frontend

**Fork `fce-weather-insurance/frontend/`.** It is Next.js 16 + React 19 + wagmi 3 + viem 2 +
`ecies-geth`, already wired for Coston2, and it ships the parts that are expensive to get
right:

- `lib/tee/ecies.ts` — client-side ECIES encryption to the TEE public key
- `lib/tee/proxy.ts` + Next API routes — server-side proxying to `EXT_PROXY_URL`, which is
  how the CORS problem is avoided
- `lib/tee/instruction.ts` — instruction encoding and result polling
- Wallet connect, chain config, explorer links, formatting

Mapping: `BuyPolicyForm` → `CreateAuctionForm` + `PlaceBidForm`; `PolicyList` → `AuctionList`;
`WeatherReportCard` → `AuctionResultCard`.

### The leak panel (required, not decorative)

Confidentiality is a *negative* property — a working sealed-bid auction looks like nothing
happening. That is a real problem for judging criteria 3 and 5.

Every auction view shows a side-by-side panel:

- **Left — "On a public order book":** what an observer would have learned (each bid amount,
  the reserve, the full book).
- **Right — "On Obscura":** the actual on-chain bytes — raw ciphertext, identical ticket
  amounts, and nothing else.

After settlement the panel reveals only the clearing price and winner, with the losing bids
still shown as ciphertext. This is the screenshot that carries the demo video.

---

## 9. Deployment topology

**Judging runs 15–21 August, a week after submission.** A stack behind ngrok on a laptop is
dead whenever the laptop sleeps. The hosting plan is a scored concern, not an afterthought.

| Component | Host | Notes |
|---|---|---|
| Contracts | Coston2 | Permanent once deployed |
| Frontend | **Vercel** | Next.js 16; `EXT_PROXY_URL` is a server-side env var |
| `extension-tee` + `ext-proxy` + `redis` | **Cloud VM** (Hetzner CPX21 or equivalent, ~€6/mo) | Same `docker-compose`, real domain, Caddy TLS |
| Indexer DB | Flare-hosted `34.38.42.208:3306/indexer` | Credentials requested from Flare |

`SIMULATED_TEE=true` requires no confidential hardware, so the stack runs on any VM that runs
Docker. ngrok stays as the local development loop only.

Because `SIMULATED_TEE=true` yields a **constant** `codeHash` (`0x194844cf…`), the
TypeScript cross-machine reproducibility gap documented in `REPRODUCIBILITY.md` does not
affect this path. TypeScript is safe for v1; the gap only matters for real Confidential Space,
which is a roadmap item.

### Environment

```
CHAIN_URL        = https://coston2-api.flare.network/ext/C/rpc
Chain ID         = 114
Explorer         = https://coston2-explorer.flare.network
Faucet           = https://faucet.flare.network/coston2   (C2FLR, FXRP, USDT0)
LOCAL_MODE       = false          # real Coston2 chain
SIMULATED_TEE    = true           # simulated attestation, MODE=1
NORMAL_PROXY_URL = https://tee-proxy-coston2-1.flare.rocks
EXT_PROXY_URL    = https://<vm-domain>          (prod)  |  https://<ngrok>  (dev)
```

Ports: ext-proxy internal `6673`, **ext-proxy external `6674`** (the one exposed publicly),
redis `6382`, types server `8100`. FCC system contract addresses are in
`config/coston2/deployed-addresses.json` — they are not in `FlareContractRegistry` yet
because FCC is pre-release.

---

## 10. Schedule

Today is 3 August. Deadline 14 August.

| Day | Date | Goal | Done when |
|---|---|---|---|
| 0 | 3 Aug | Request indexer creds · install ngrok · free disk · fund 3 wallets · clone repos | Creds requested, repos local |
| 1 | 4 Aug | **Stock `fce-sign` green end-to-end on Coston2** | `./scripts/test.sh` passes |
| 2 | 5 Aug | `KEY` → `AUCTION`; CREATE/BID/CLOSE with plaintext bids | E2E green, clearing correct |
| 3 | 6 Aug | ECIES: publish TEE pubkey, encrypt client-side | Bids unreadable on-chain, TEE decrypts |
| 4 | 7 Aug | `AuctionHouse.sol` — tickets, TEE sig verification, settle, cancel | Foundry tests pass |
| 5 | 8 Aug | Vickrey clearing, refunds, FTSO rate, commitment, edge cases | Below-reserve rejected; refunds exact |
| 6 | 9 Aug | Frontend fork + leak panel | Full flow in browser, 3 wallets |
| 7 | 10 Aug | **Deploy TEE stack to cloud VM** + Vercel | Public URL works with laptop closed |
| 8 | 11 Aug | *Stretch:* Smart Accounts XRPL memo (`0xFF`) bidding | XRPL Payment → bid on Flare |
| 9 | 12 Aug | Full rehearsal, bug hunt, freeze addresses | Clean recordable run |
| 10 | 13 Aug | Demo video (3–4 min) + README + diagram | Video uploaded |
| 11 | 14 Aug | Distribution + buffer + **submit early** | Submitted |

**Day 1 cannot slip.** Designated sacrifices, in order: day 8 (Smart Accounts), frontend
polish, FTSO integration.

### Abandonment criteria — decided now, not renegotiated later

| Trigger | Action |
|---|---|
| No indexer credentials by **5 Aug** evening | Switch to Confidential Space fallback (§12) |
| Stack not green by **6 Aug** | Same fallback |
| Fallback not working by **8 Aug** | Drop bounty 2, pivot to Smart Accounts for bounty 1 |

---

## 11. Roadmap (submission section)

1. **FAssets liquidation auctions.** Flare's own materials note that liquidations are won by
   MEV bots and agents get bad prices. Sealed bids remove the ordering advantage. The
   `ILiquidationSource` interface is the seam.
2. **TEE state persistence.** FCC supports key backup/restore; auction state needs the same.
   Removes the timeout path as a routine occurrence.
3. **k-of-n multi-TEE clearing.** `TeeMachineRegistry.getRandomTeeIds(extensionId, count)`
   already supports fan-out. Removes the single-enclave confidentiality assumption.
4. **Real GCP Confidential Space attestation** (`MODE=0`), via Flare devops image hand-off.
5. **Songbird deployment**, then mainnet.

---

## 12. Fallback plan

If FCE is blocked, **change the infrastructure, not the product**:

- Run the same auction service on Google Cloud Confidential Space (Intel TDX)
- Verify the vTPM attestation on-chain on Coston2 via `flare-foundation/flare-vtpm-attestation`
- Same contracts, same product, same pitch — only TEE registration changes

Requires no permission from anyone. It is also the path the 2025 Flare hackathon winners took,
so it is more crowded and less differentiating. Plan A only falls back when forced.

---

## 13. Out of scope for v1

Named explicitly so scope creep has to argue against a written decision: multi-asset auctions,
mainnet deployment, order books or continuous markets, NFT auctions, DAO governance, AI
agents, mobile app, English/Dutch auction formats, cross-chain settlement via LayerZero.

---

## 14. Known gotchas

| Symptom | Cause / handling |
|---|---|
| `ext-proxy` won't start, DB sync error | Indexer DB credentials missing or wrong in `config/proxy/extension_proxy.coston2.docker.toml` |
| `MachineManager.TooMany()` | `config/extension.env` extension ID disagrees with the on-chain TEE record — almost always from `pre-build.sh --force`. **Never `--force` casually.** |
| `Verification.ChallengeExpired` | Re-run `post-build.sh`; the capital `R` in `register-tee -command rRap` issues a fresh challenge |
| `InvalidGovernanceHash` | `GOVERNANCE_SIGNERS`/`GOVERNANCE_THRESHOLD` disagree with what the node signed — leave both unset for deployer-only default |
| `code hashes do not match` | `SIMULATED_TEE` and container `MODE` disagree. Want `SIMULATED_TEE=true` + `MODE=1` |
| `Verification.TeeNotFound` | `NORMAL_PROXY_URL` points at the wrong chain's FTDC proxy |
| `unsupported op type` / `op command` | opType/opCommand strings differ across the three layers (§5) |
| Signature recovers wrong address | Verifying `resultHash` instead of the domain-separated payload (§6) |
| TEE registration times out | `docker compose restart ext-proxy` — it may have missed a signing policy round |
| Sign port confusion | TypeScript defaults `signPort` to `9090`; some docs say `7701`. Read it from config, never hardcode |

**Security:** port 6674 is publicly callable. Coston2 testnet only. No real value at risk.

---

## 15. Working rules

1. **Day 1 first.** No auction logic until stock `fce-sign` passes `./scripts/test.sh` on
   Coston2. If the TEE round-trip does not work, everything else is worthless.
2. **Commit 3–5 times a day with real messages.** "Evidence of new work" is a scored
   criterion and git history is the evidence. Never squash the project into one commit.
3. **Keep clearing logic infrastructure-agnostic.** The Vickrey computation lives in a pure
   module with no TEE-specific imports, so the §12 fallback is a swap and not a rewrite.
4. **Never `pre-build.sh --force`** unless deliberately minting a new extension.
5. **Ask before adding dependencies.** Every package is a new way for the enclave image to
   fail.
6. **Cut features, never cut "it works."**
