# Flare Summer Signal — Hackathon Brief

Neutral context document. **No project has been chosen yet.** This exists so you can brainstorm ideas from a full picture of what the hackathon rewards and what Flare can actually do today.

Written 3 August 2026. Deadline is 14 August 2026 — **11 days left.**

---

## PART 1 — The hackathon

### What it is

An open online hackathon for builders shipping real products on Flare. You may build from scratch, bring an existing project, or port an existing product to Flare. Two focus areas: interoperable asset products, and private applications built with Flare Confidential Compute.

### Timeline

| Date | Event |
|---|---|
| 29 June | Registration + development opened |
| **14 August** | **Final submission deadline** |
| 15–21 August | Judging period |
| 24 August | Winner announcement |

### Prizes

**Bounty 1 — Interoperable Asset Products** — $6,000 pool
- 1st: $4,000 · 2nd: $2,000

**Bounty 2 — Confidential Compute Apps** — $6,000 pool
- 1st: $4,000 · 2nd: $2,000

You may select one bounty or both.

### Judging criteria

1. **Product usefulness** — does it solve a real user, developer, ecosystem, or infrastructure problem?
2. **Flare integration quality** — is Flare used meaningfully, or is the integration superficial?
3. **Technical execution** — does the demo work? Is the architecture credible and understandable?
4. **Evidence of new work** — did the team clearly show what was newly built, ported, integrated, or improved?
5. **Clarity and future potential** — can the team explain product, user, integration, and next steps? Is there a credible path beyond the hackathon?

### Required in the submission

- Project name
- Selected bounty or bounties
- Short product description
- Target user
- Demo link, video, or working app link
- GitHub repo or technical materials
- Explanation of how the project uses Flare
- Explanation of what was newly built / ported / integrated / improved during the program
- Smart contract addresses or deployment details, if applicable
- Short roadmap or next steps

### Encouraged but not required

- Whether deployed on Coston2, Songbird, or Flare Mainnet
- How far you got with user acquisition, distribution, testing, or real user feedback
- Any early usage, community interest, pilot users, partner conversations, traction signals

These help judges evaluate whether the project has potential beyond the hackathon.

### Existing projects

Explicitly welcome. If bringing one, separate clearly: what existed before, what was newly built, what was ported/integrated/improved on Flare, and why the new work matters to users, developers, or the ecosystem.

### Contact

Flare Hackathon Telegram: https://t.me/+5Vn6ZKhr6KI3NjIx
Developer materials: https://dev.flare.network/

---

## PART 2 — What Flare is

An EVM-compatible Layer 1 built to unlock DeFi for assets that lack native smart contracts, starting with XRP via FAssets. Its differentiator is **enshrined data protocols** — FTSO (price oracle) and FDC (external data/event attestation) are built into the core Flare Systems Protocol, inheriting the network's full economic security rather than sitting on top as third-party services.

### Network config

| | Flare Mainnet | Coston2 Testnet |
|---|---|---|
| RPC | `flare-api.flare.network/ext/C/rpc` | `coston2-api.flare.network/ext/C/rpc` |
| Chain ID | 14 | 114 |
| Explorer | flare-explorer.flare.network | coston2-explorer.flare.network |
| Faucet | — | faucet.flare.network/coston2 |

**The Coston2 faucet gives C2FLR, FXRP and USDT0.** That is unusually generous and means you can demo real asset flows on testnet, not mocks.

### Ecosystem numbers (useful for framing "why this matters")

Numbers vary by source and date — treat as directional, verify before quoting in a submission.

- Flare TVL: roughly $160–200M, up from under $10M in mid-2024
- FXRP minted: reported between 90M and 155M depending on source/date; roughly 80% deployed into DeFi
- 880,000+ active addresses
- Flare is already the largest EVM DeFi venue for XRP
- FLR: ~$0.008, ~$700M market cap, ~94% below all-time high
- FIP.16 tokenomics overhaul routes protocol revenue into buyback-and-burn

**The XRPL RWA situation — this is the strategic backdrop for both bounties:**
- Tokenized RWA value on XRPL reached ~$4.18B (Evernorth Research), up ~28x year over year
- But most of it is **"represented"** not **"distributed"** — recorded on-chain, not freely transferable
- At ~$2.3B total, ~$1.49B was represented, the ledger showed **~22 RWA holders**, and 30-day transfer volume had fallen ~91% to ~$10M

Translation: enormous asset value sitting inert, with almost no liquidity or composability. XRPL issues and moves assets but is not a smart-contract execution environment by design. Flare's entire bet is being the place where those assets become *usable*. Anything you build that converts inert XRPL value into active, composable, or tradeable value is aligned with what Flare itself is trying to prove.

---

## PART 3 — The technical menu

What you can actually build with, and how mature each piece is.

### Flare Confidential Compute (FCC) — NEW, the Bounty 2 surface

Extends Flare with TEEs for secure off-chain computation, cross-chain transaction signing, and fast data attestation. Deployed to Songbird (canary network) following a July 2026 governance vote. Docs describe it as "in the final stages of development, not yet a fully public production system."

**Three components:** smart contracts (extension/machine registration, instruction issuance, key admin) · data providers & cosigners (relay instructions, sign them) · TEE machines (verify threshold consensus, execute, sign results).

**Flare Compute Extensions (FCE)** — the developer surface. Each extension is an isolated set of functions running on TEE machines; think "smart contracts extended into enclaves." The infrastructure gives you: TEE identity keys, on-chain registration via attestation, on-chain-verifiable signed results, instruction relaying, and secure key generation/backup/restore.

Instructions only reach TEE machines after **50%+ signature weight** from Flare's data providers, using the same signing policy as the rest of the Flare Systems Protocol.

**Two built-in system applications:**
- **Protocol Managed Wallets (PMW)** — a protocol on Flare creates and operates a wallet on an external chain (XRPL, BTC) by code rather than custodian. Keys generated and held inside TEEs. k-of-n native multisig on the external chain. Nonce management, reissuance/nullification, FDC execution proofs. *Marked "in development" on the dev hub.*
- **TEE-based FDC (v2)** — fast attestation; TEE signatures serve as proof of data-provider consensus.

**What building an FCE actually requires:**
- Docker, Foundry, Node or Go, an HTTPS tunnel (ngrok) exposing port 6674
- Three services: `extension-tee`, `ext-proxy`, `redis`
- `SIMULATED_TEE=true` lets you develop with **no Confidential VM hardware** — important, this lowers the bar a lot
- **Coston2 indexer DB credentials, which are not published in the docs** — you must request them from Flare via support or @FlareDevs. This is a hard gate and a waiting dependency.

Extensions can be written in **Go, Python, or TypeScript** (the `fce-sign` repo ships all three).

Guides: getting started (Hello World) · Private Key Extension (ECIES decrypt + enclave key storage + signing) · Weather Insurance Extension (settles rainfall insurance).
Repos: `flare-foundation/fce-extension-scaffold` · `flare-foundation/fce-sign` · `tee-node` · `tee-proxy`

### The other Confidential Compute route — Flare AI Kit

`flare-foundation/flare-ai-kit` (alpha) — SDK for verifiable AI agents using **Google Cloud Confidential Space** (Intel TDX). Multi-agent consensus via Google A2A, agent framework on Google ADK, VectorRAG over Flare docs, connectors for FTSO/FDC/FAssets and ecosystem dApps (SparkDEX, Kinetic, Cyclo, OpenOcean), social connectors (X, Telegram, Farcaster).

Paired with `flare-foundation/flare-vtpm-attestation` for verifying vTPM attestations on-chain.

**This route requires no credentials from anyone** — but it is also the well-trodden path (see prior art below), so expect more competition here.

### FAssets / FXRP — the Bounty 1 core

Trustless over-collateralized bridge from non-smart-contract chains to Flare. FXRP live on mainnet; v1.3 (May 2026) enables minting in a **single XRPL transaction**, treating mints as ordinary XRP withdrawals from major exchanges (Binance, Kraken, OKX, Upbit, Bithumb).

Mechanics available: minting, redemption, collateral, core vault, liquidation, emergency pause, agents, minting tags (as NFTs, transferable), redemption queue, redemption defaults, minting rate limits.

Roadmap mentions FBTC, FDOGE, FLTC beyond FXRP.

### Flare Smart Accounts — NEW

Account abstraction letting XRPL users act on Flare **without owning any FLR**. Each XRPL address gets a `PersonalAccount` on Flare (deployed via CREATE2), controlled through XRPL `Payment` transactions.

**Two flows:**
- *Proof-based* — 32-byte instruction in the payment reference; operator requests an FDC `Payment` attestation and submits it to `MasterAccountController`
- *Direct-minting (memo)* — memo carries the instruction; FAssets `AssetManager` mints FXRP straight to the smart account

**Built-in instruction types:** FXRP (collateral reservation, transfer, redeem) · Firelight vaults · Upshift vaults.

**Custom instructions** — arbitrary Flare function calls encoded as an EIP-4337 `PackedUserOperation`, either committed as a hash and delivered by an off-chain executor (`0xFE`) or carried inline in the XRPL memo (`0xFF`). Authorization comes from the XRPL payment signature itself.

This is genuinely powerful: **an XRPL user with zero Flare knowledge and zero FLR can trigger arbitrary EVM logic by sending one XRP payment.** Full TypeScript + Viem guides exist, including cross-chain mint and redeem via LayerZero.

### Flare Data Connector (FDC)

On-chain attestation of external data. Attestation types available:

`Payment` · `ReferencedPaymentNonexistence` · `BalanceDecreasingTransaction` · `ConfirmedBlockHeightExists` · `AddressValidity` · `EVMTransaction` · `XRPPayment` · `XRPPaymentNonexistence` · **`Web2Json`**

`Web2Json` is the wildcard — fetches any JSON over HTTP, applies a jq filter, returns ABI-encoded data on-chain. Any Web2 API becomes an on-chain data source.

Worked example guides in both Foundry and Hardhat: proof of reserves, weather insurance, cross-chain payment, cross-chain FDC (using Flare's data on non-Flare chains like the XRPL EVM sidechain).

### FTSO v2

Enshrined oracle. **Block-latency feeds** update roughly every 1.8 seconds with each block. **Scaling anchor feeds** update every voting epoch (~90s). Custom feeds let you bring arbitrary time-series data on-chain. Also provides secure randomness. Adapters exist for migrating dApps off other oracles.

### FXRP-adjacent primitives worth knowing

- **Firelight and Upshift vaults** — ERC-4626 vaults compatible with FXRP (deposit, mint shares, withdraw, redeem, claim)
- **FXRP as OFT** — omnichain fungible token via LayerZero; auto-mint and auto-redeem across chains
- **x402** — HTTP-native payments using EIP-3009
- **Gasless FXRP payments** — EIP-712 signed meta-transactions with a relayer
- **Gasless USDT0 transfers**

### Tooling

- Wallet SDKs: Turnkey, Wagmi, MetaMask Embedded Wallets, RainbowKit, Etherspot
- Bridges: LayerZero, Stargate, zkBridge
- Indexers: Goldsky, sqd, SubQuery
- OFTs on Flare: USD₮0, flrETH, USDC.e, WETH, USDT
- Hardhat and Foundry starter kits

### AI-assisted development

```
claude mcp add --transport http flare-devhub https://dev.flare.network/mcp
npx skills add https://github.com/flare-foundation/flare-ai-skills
```

Skills available: `flare-general`, `flare-ftso`, `flare-fassets`, `flare-fdc`, `flare-smart-accounts`.
Every doc page returns raw markdown if you append `.md`. Full index: https://dev.flare.network/llms.txt

---

## PART 4 — Prior art

**Flare × Google Cloud hackathon, March 2025** (with Blockchain at Berkeley): 460+ participants, four tracks, students from Berkeley, Waterloo, ETH Zurich. All projects used Google Confidential Space on AMD SEV with vTPM attestations verified on Flare.

Winning project **2DeFi** (AI × DeFi track, 1st): users uploaded Robinhood portfolio screenshots, Gemini 2.0 assessed risk tolerance, the risk profile mapped to an automated DeFi strategy with staking and LP on Flare. Also used embedded wallets for Google-login-based onboarding.

**What this tells you:** the "TEE + AI agent + Confidential Space" idea is the obvious one and has already been done and celebrated. It is the default thing a team reaches for in a Confidential Compute track. Weigh that when deciding how to differentiate.

**Encode London 2024** hackathon focused on FDC — worth knowing that FDC-based dApps are also familiar territory to these judges.

---

## PART 5 — Constraints to design around

| Constraint | Implication |
|---|---|
| **11 days, solo** | Scope brutally. A narrow working demo beats a broad broken one — criterion 3 is "does the demo work." |
| **FCC is pre-release** | Only developable on Coston2. Say so plainly in the submission; the judges know. |
| **Indexer credentials are gated** | If any FCE idea survives brainstorming, request credentials on day one — it's a waiting dependency, not a task. |
| **Confidential Space route is ungated** | No permission needed, but more crowded. |
| **PMW is "in development"** | Don't design a submission whose core depends on PMW being available to you. |
| **TEE state is not persistent across restarts** | Anything stateful inside an enclave needs a story for this. FCC supports key backup/restore; general state is your problem. |
| **Judges are the Flare team** | Ideas that advance Flare's own stated thesis (making inert XRPL assets useful) land better than generic DeFi. |
| **Criterion 4 is scored** | Commit frequently with real messages. Git history is the evidence of new work. |
| **Traction is explicitly encouraged** | Budget a day for distribution. Real testnet users are a differentiator most hackathon projects skip. |

---

## PART 6 — Open problem areas

Not recommendations — raw material for brainstorming. Each is a real gap, not a product.

**Around the XRPL liquidity problem**
- $4.18B of RWA on XRPL held by ~22 wallets with collapsing transfer volume. What makes represented assets become distributed ones?
- Institutional holders won't publish price or position on an open book. What market structures does that rule out, and which of them become possible with confidential compute?
- Large FXRP blocks have no venue that doesn't leak intent.

**Around FAssets mechanics**
- Liquidations are won by MEV bots; agents get bad prices.
- Agent operations (collateral management, redemption handling) are complex and mostly manual.
- Redemption defaults need monitoring — who does that for a normal user?

**Around confidentiality specifically**
- What mechanisms are *provably impossible* on a public chain? (Sealed-bid and second-price auctions, private matching, confidential voting, anything where revealing an input destroys the incentive.) These are the strongest FCC arguments, because "a smart contract can't do this" is unarguable.
- Private data that currently can't touch a chain: salaries, credit history, medical, KYC, proprietary trading signals, institutional positions.
- Verifiable computation over data the verifier isn't allowed to see.

**Around Smart Accounts**
- An XRPL user with zero FLR can trigger arbitrary EVM logic with one payment. What experience does that unlock that wasn't possible before?
- Onboarding: 800k+ Flare addresses vs. millions of XRP holders who have never touched EVM.

**Around FDC Web2Json**
- Any HTTP JSON API becomes an on-chain oracle with a jq filter. What off-chain data is valuable enough on-chain that nobody has bridged it yet?

**Around developer/infrastructure gaps**
- FCC docs are two weeks old. Tooling, testing harnesses, local dev experience, and debugging for FCE developers are essentially nonexistent.
- Infrastructure products are often easier to make credible than consumer products with no users — you are the target user, and "does it solve a real developer problem" is answerable without traction.

---

## PART 7 — Links

**Hackathon**
- Telegram: https://t.me/+5Vn6ZKhr6KI3NjIx

**Core docs**
- Dev hub: https://dev.flare.network/
- Machine-readable index: https://dev.flare.network/llms.txt
- FCC overview: https://dev.flare.network/fcc/overview
- FCC whitepaper: https://dev.flare.network/assets/files/20260706-FlareConfidentialCompute-e488bdb4c8fc5e7dc02ea2b1c890f9c6.pdf
- FCC — build first extension: https://dev.flare.network/fcc/guides/getting-started
- FCC — private key extension: https://dev.flare.network/fcc/guides/sign-extension
- FCC — weather insurance extension: https://dev.flare.network/fcc/guides/weather-insurance-extension
- Smart Accounts: https://dev.flare.network/smart-accounts/overview
- Smart Accounts TS/Viem guides: https://dev.flare.network/smart-accounts/guides/typescript-viem
- FAssets: https://dev.flare.network/fassets/overview
- FXRP: https://dev.flare.network/fxrp/overview
- FDC: https://dev.flare.network/fdc/overview
- FDC attestation types: https://dev.flare.network/fdc/attestation-types
- FTSO: https://dev.flare.network/ftso/overview
- Faucet: https://faucet.flare.network/coston2

**Repos**
- https://github.com/flare-foundation/fce-extension-scaffold
- https://github.com/flare-foundation/fce-sign
- https://github.com/flare-foundation/tee-node
- https://github.com/flare-foundation/tee-proxy
- https://github.com/flare-foundation/flare-ai-kit
- https://github.com/flare-foundation/flare-vtpm-attestation
- https://github.com/flare-foundation/flare-ai-skills
