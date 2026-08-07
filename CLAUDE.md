# Working on Tempo

Read this first. It exists so a fresh session does not re-derive what already
cost days, and does not re-open decisions that are settled.

## What this is

Tempo gives XRPL holders **deferred and conditional execution on Flare**. One
XRP payment registers a standing order — and, optionally, the exit that unwinds
it — with no FLR, no EVM wallet and no bridge.

The one-line idea: *the user operation registers an order instead of performing
an action.* That is how you get deferred execution from a primitive that has
none.

Built for the **Flare Summer Signal** hackathon. Submission **14 Aug 2026**,
judging 15–21 Aug, winners 24 Aug. Solo, Bounty 1.

## Hard constraints — do not propose anything that breaks these

- **Zero budget.** Nothing paid, ever. No credit card even for a free tier that
  asks for one. This killed an earlier design (Obscura, sealed-bid auctions on
  Flare Confidential Compute) because it needed an always-on TEE container and
  no free card-free host exists.
- **The laptop gets closed.** Judging runs a week past submission, so nothing
  may depend on a local process. Free tiers that work: Vercel Hobby, GitHub
  Actions cron (public repo), Supabase, cron-job.org.
- **Vercel Hobby cron fires once a day.** Scheduling lives in GitHub Actions.
- **~11 GB free disk.** No Docker.

## Working agreement

- **Turkish in chat, English in the repo.** Every artifact — specs, code,
  comments, commit messages, docs — is English. Do not mix the two inside one
  file.
- **Verify on chain, not just in tests.** Nearly every real bug in this project
  was found by running the thing against Coston2, not by a passing suite. A
  test proves the logic; only the chain proves the integration.
- **Never claim what has not been observed.** If a path has not been executed,
  say so. Several entries in the Traps section below are cases where an
  assumption looked correct and was not.
- **Say what does not work.** `docs/security.md` lists residual risks, not just
  guarantees. Keep it that way.

## Where things live

```
contracts/        Foundry. Tempo.sol, four adapters, 35 tests
  src/Tempo.sol           the order registry and executor
  src/adapters/           VaultDeposit, VaultWithdraw, Redeem, Swap
  script/Deploy.s.sol     predicts Tempo's address, then asserts the prediction
  test/                   unit + Coston2 fork + Flare mainnet fork
web/              Next.js 16 + Tailwind v4. Landing, docs, demo, relayer, keeper
  src/lib/flare/          Smart Accounts, FDC, chain clients, recovery
  src/lib/tempo/          order encoding, reads, keeper, epoch vaults
  src/lib/relayer/        the stateless relay state machine
  src/app/api/            orders, cancel, relay, keeper, state, price, history
docs/             deployments, security, chain constants, cosmetics backlog
docs/specs/       the original design spec + a revision log of what reality changed
.github/workflows/keeper.yml
```

Secrets are in `.env.local` (root, for contracts) and `web/.env.local`. Both are
gitignored. **The repo is public.** Never write a key or seed into a tracked
file.

## Current state

| | |
|---|---|
| Live | https://tempo-three-orpin.vercel.app |
| Tests | 35 — 27 unit, 5 vs live Coston2, 3 vs Flare mainnet fork |
| Contracts | `Tempo 0x5B281A91b54bd2E43f9f39A5AEF0CC7BbF15Fb6D` and four adapters, see `docs/deployments.md` |
| XRPL demo wallet | `rPP5BkPmiiXGUQ7bDJYY68k9pNdTadKkDb` |
| PersonalAccount | `0xbbE8ACB8B3e9754Cd1f3961792183330cc1A458F` |

Exercised on chain: one payment creating a plan and its exit, DCA slices, the
two-phase vault exit and its claim, stuck-mint recovery, cancellation, and
redemption home to the XRP Ledger. Only `SWAP_TO_STABLE` has not run on testnet
— SparkDEX has no testnet deployment, so it is proven on a mainnet fork.

## Decisions already made — do not relitigate

**`0xFE`, not `0xFF`.** The inline memo variant is capped near a kilobyte.
Tempo's user operation is 1,952 bytes for a plan plus its exit — measured.

**No perp adapter.** Three independent reasons, all found by reading SparkDEX
Eternal's ABI: it is mainnet-only, it already carries native TP/SL, and it
charges 2 FLR per order as `msg.value` — the one thing Tempo's users are defined
by not having.

**No `0xE2`.** Its byte layout is published nowhere verifiable. Guessing the
layout of a memo that moves money strands funds rather than recovering them.

**No mock AMM.** SparkDEX has no Coston2 or Coston deployment (verified by code
size at its published addresses). Rather than deploy a toy and call it a venue,
`SwapAdapter` binds to the real router interface and is proven on a Flare
mainnet fork against the real pool.

**Allowance, not deposit.** Orders are backed by an ERC-20 allowance. Funds stay
in the user's PersonalAccount, Tempo holds no balance between executions, and
cancelling costs nothing.

**Immutable adapters.** Constructor arguments, not settable state — not even the
deployer can repoint a live order. The cost is that adding an action means a
redeployment which orphans existing orders. Accepted.

**The chart shows FTSO *and* market price.** The contract triggers on FTSO and
nothing else. Charting only a market feed would let a target appear crossed
while the contract disagreed.

## Traps — every one of these cost real time

**`deal()` does not work on FXRP.** It is a proxy with its own supply
accounting, so a forged balance underflows inside `transferFrom`. Fork tests
impersonate a real holder instead.

**Flare's vaults are not plain ERC-4626.** `redeem` pays nothing: it burns the
shares and files a withdrawal against a daily period, released only after a lag
(300s on `TESTstXRP`). An exit that stops here leaves the user credited but
unpaid.

**The date `claim` wants comes from the *request's* period**, not from
`getWithdrawalEpoch()`, which reports the current one. A claim inside the lag
reverts with `0x085de625` — which reads like a permission error and is only
impatience.

**viem sends the bare gas estimate.** Tempo's executions nest three deep into a
vault redeem and EIP-150 forwards only 63/64 per hop, so the outermost frame ran
out on its final storage write *after doing all the real work*. Keeper sends
carry 50% headroom.

**`waitForTransactionReceipt` resolves for reverted transactions.** Not checking
`receipt.status` made the keeper report every send as executed, which hid the
out-of-gas above. Check it.

**Env overrides config defaults.** Updating a contract address in
`config.ts` while `web/.env.local` still holds the old one sent a user operation
to a contract that did not know the new action, reverting the mint. Update both.

**Flare runs its own executor.** `PaymentAlreadyConfirmed` on a recovery leg
means someone else applied it — the outcome we wanted, not a failure.

**Fees come out of the payment, not on top.** Compute the XRPL amount from the
intended net mint, never the reverse.

**Direct minting is not lot-aligned.** A 10.2 XRP payment minted 10.1 FXRP. Lot
alignment constrains redemption, not minting.

**The FDC attestation type is `XRPPayment`**, not the legacy `Payment`.
Different response shapes; `AssetManagerFXRP` accepts only the former.

**XRPL payments to smart accounts must be untagged.** A destination tag makes
FAssets credit the tag holder instead.

**Videos never loaded in the automated browser** used during development —
`readyState 0`, no error, while images on the same page loaded fine. Treat video
playback as unverified until someone watches it in a real browser.

## Running it

```bash
# Contracts
cd contracts
forge test                                                             # offline
COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc forge test  # + live
FLARE_RPC_URL=https://flare-api.flare.network/ext/C/rpc forge test      # + mainnet fork

set -a && . ../.env.local && set +a
forge script script/Deploy.s.sol:Deploy --rpc-url "$COSTON2_RPC_URL" --broadcast

# App
cd web && npm run dev
vercel --prod --yes          # then update TEMPO_ADDRESS in Vercel env if redeployed
```

Fork tests report as **skipped** without an RPC URL rather than passing. A green
tick on a test that never touched the chain is worse than no test.

After any contract redeployment: update `web/.env.local`, `config.ts`, the
Vercel env var, `docs/deployments.md`, `README.md`, and regenerate the ABI from
`contracts/out/Tempo.sol/Tempo.json`.

## What is left

- Cosmetics — see `docs/cosmetics-backlog.md`. Borrowed media, a placeholder
  illustration, an unlicensed font substitute, unverified video playback.
- Demo video and submission write-up.
- A licence for the repo.
