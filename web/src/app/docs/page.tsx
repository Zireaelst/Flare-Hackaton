import Link from "next/link";
import { Nav } from "@/components/Chrome";
import { DocsNav } from "./DocsNav";
import { CONTRACTS, FLARE_CONTRACTS, SECTIONS } from "./content";

export const metadata = {
  title: "Tempo — Docs",
  description:
    "How Tempo turns one XRPL payment into a standing order on Flare: the 0xFE custom instruction, the order model, permissionless execution, two-phase vault exits, and stuck-mint recovery.",
};

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
  );
}

function Block({ children }: { children: string }) {
  return (
    <pre className="my-5 overflow-x-auto rounded-xl border border-black/8 bg-white p-5 font-mono text-[13px] leading-relaxed text-black/80">
      {children}
    </pre>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-28 pt-14 text-3xl font-medium md:text-4xl"
      style={{ letterSpacing: "-0.03em" }}
    >
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-9 text-xl font-medium tracking-tight">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[15px] leading-relaxed text-black/70">{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 rounded-xl border border-black/8 bg-[#FFF6F2] p-5 text-[15px] leading-relaxed text-black/75">
      {children}
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-black/8 bg-white">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-black/8">
            {head.map((h) => (
              <th key={h} className="px-5 py-3 font-medium text-black/50">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i > 0 ? "border-t border-black/6" : ""}>
              {row.map((cell, j) => (
                <td key={j} className="px-5 py-3 align-top text-black/75">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-[88rem] gap-12 px-6 py-12">
        <DocsNav sections={SECTIONS} />

        <article className="min-w-0 max-w-3xl flex-1 pb-24">
          <h1 className="text-5xl font-medium md:text-6xl" style={{ letterSpacing: "-0.04em" }}>
            Documentation
          </h1>
          <P>
            Tempo gives XRPL holders deferred and conditional execution on Flare. One XRP payment
            registers a standing order — and, optionally, the exit that unwinds it — with no FLR, no
            EVM wallet and no bridge. This page describes what actually ships.
          </P>

          {/* ---------------------------------------------------------------- */}
          <H2 id="problem">The gap</H2>
          <P>
            XRPL is a settlement ledger. It can send a payment; it cannot say <em>later</em> and it
            cannot say <em>if</em>.
          </P>
          <P>
            Flare Smart Accounts closes the authorization half of that: one XRPL payment can trigger
            arbitrary EVM logic through an EIP-4337 <Code>PackedUserOperation</Code>, with no FLR and
            no EVM wallet. Smart Accounts v1.3 (28 July 2026) went further and made one signature
            enough to enter a curated vault. Over 40 million XRP has gone in that way.
          </P>
          <P>
            What it does not close is time. A user operation runs <strong>once</strong>, immediately,
            atomically with the mint. There is no schedule and no condition — and, more pointedly,
            no way out. Leaving a Flare vault from an XRPL wallet means noticing the moment
            yourself, sending a payment to request the withdrawal, waiting out the vault&apos;s lag,
            and sending a third transaction to claim it.
          </P>
          <Note>
            <strong>Tempo&apos;s idea is one line long:</strong> the user operation registers an
            order instead of performing an action. That is how you get deferred execution from a
            primitive that has none.
          </Note>

          {/* ---------------------------------------------------------------- */}
          <H2 id="mechanism">How one payment becomes an order</H2>
          <P>
            The user operation is built and committed to <em>before</em> any XRP moves, so the bytes
            an executor will need already exist by the time the payment settles.
          </P>
          <Block>{`1. The compose screen encodes abi.encode(PackedUserOperation)
   and hands it to the relayer.

2. One untagged XRPL Payment goes to the FAssets Core Vault:
   memo = 0xFE | walletId(1) | executorFeeUBA(8) | keccak256(userOp)(32)
   — 42 bytes, whatever the batch size.

3. The relayer fetches an FDC XRPPayment attestation and calls
   AssetManager.executeDirectMintingWithData(proof, data).

   Atomically, in one Flare transaction:
     · FXRP is minted to the user's PersonalAccount
     · that account approves Tempo and registers the order(s)

4. Later, when the trigger is satisfied, ANYONE calls
   Tempo.execute(orderId).`}</Block>

          <H3>Why 0xFE and not 0xFF</H3>
          <P>
            The inline variant carries the whole operation in the memo, capped by XRPL at roughly a
            kilobyte. Tempo&apos;s user operation is <strong>1,952 bytes</strong> for a plan and its
            exit — measured, not estimated. <Code>0xFE</Code> commits only a 32-byte hash, so the
            memo stays 42 bytes no matter how large the batch grows, and the controller checks{" "}
            <Code>keccak256(data)</Code> against it before running anything.
          </P>

          <Note>
            The payment must be <strong>untagged</strong>. A destination tag makes FAssets credit the
            tag holder instead of the smart account, handing someone else the mint.
          </Note>

          {/* ---------------------------------------------------------------- */}
          <H2 id="orders">The order model</H2>
          <P>An order pairs a trigger with an action. They are independent.</P>

          <Table
            head={["Trigger", "Fires when"]}
            rows={[
              [<Code key="s">SCHEDULE</Code>, "every intervalSeconds, slices times"],
              [<Code key="t">TAKE_PROFIT</Code>, "FTSO XRP/USD ≥ priceTarget"],
              [<Code key="l">STOP_LOSS</Code>, "FTSO XRP/USD ≤ priceTarget"],
            ]}
          />

          <Table
            head={["Action", "What it spends", "What it does"]}
            rows={[
              [<Code key="a">VAULT_DEPOSIT</Code>, "FXRP", "Deposits into an allowlisted ERC-4626 vault"],
              [<Code key="b">VAULT_WITHDRAW</Code>, "vault shares", "Requests a withdrawal; the keeper claims it later"],
              [<Code key="c">REDEEM_TO_XRPL</Code>, "FXRP", "Native FAssets redemption to an XRPL address"],
              [<Code key="d">SWAP_TO_STABLE</Code>, "FXRP", "Sells into USDT0 on SparkDEX — mainnet only"],
            ]}
          />

          <P>
            Adapters declare their own input token, which is why an exit can spend shares while a
            deposit spends FXRP without Tempo hardcoding an assumption that is only true half the
            time.
          </P>

          <H3>WHOLE_BALANCE</H3>
          <P>
            An exit is usually written in the same payment as the plan it protects — before a single
            vault share exists — so there is no number the user could put in. Setting{" "}
            <Code>amountPerSlice</Code> to <Code>type(uint256).max</Code> means &ldquo;whatever the
            balance is when this fires&rdquo;. It also survives yield accruing, where a figure fixed
            weeks earlier would strand dust exactly when someone is trying to get all the way out.
          </P>
          <P>
            It is restricted to a single slice: &ldquo;everything&rdquo; cannot be divided, and
            allowing it would let the first execution take the lot and leave the rest with nothing.
          </P>

          <H3>Linked exits</H3>
          <P>
            <Code>createOrderWithExit(plan, exit)</Code> creates both and ties them together. It has
            to be one call — the user operation is encoded before either order exists, so the client
            cannot know the plan&apos;s id, and predicting it from <Code>orderCount</Code> breaks the
            moment someone else&apos;s order lands in between.
          </P>
          <P>
            When the exit executes it cancels the plan. Without that, a stop fires, the position
            unwinds, and the schedule promptly buys back into the fall — observed on Coston2 before
            this existed.
          </P>

          {/* ---------------------------------------------------------------- */}
          <H2 id="execution">Execution</H2>
          <P>
            <Code>execute(orderId)</Code> is permissionless and the caller supplies{" "}
            <strong>nothing but an order id</strong>. No price, no timestamp, no proof. Every
            condition is re-derived inside the contract from FTSO and <Code>block.timestamp</Code>.
          </P>
          <P>
            A lying or absent keeper can therefore make an order <em>late</em>; it cannot make one{" "}
            <em>wrong</em>. That is what makes permissionless execution safe rather than merely
            open.
          </P>
          <P>
            Orders are backed by an allowance, not a deposit. Funds stay in the user&apos;s
            PersonalAccount between executions, Tempo holds no balance for anyone to grief, and
            cancelling costs nothing.
          </P>

          <H3>Stale feeds</H3>
          <P>
            A price trigger reads the block-latency feed and rejects anything older than{" "}
            <Code>maxPriceAge</Code> (300s). A stale feed makes the order wait rather than execute on
            data that no longer describes the market. Schedule orders carry no price condition, so a
            dead feed cannot stall them.
          </P>

          {/* ---------------------------------------------------------------- */}
          <H2 id="withdrawals">Vault exits are two-phase</H2>
          <P>
            Flare&apos;s FXRP vaults are not plain ERC-4626. <Code>redeem</Code> pays nothing: it
            burns the shares and files a withdrawal against a daily period, released only after the
            vault&apos;s lag. Read from <Code>TESTstXRP</Code> on Coston2:
          </P>
          <Table
            head={["Setting", "Value"]}
            rows={[
              [<Code key="a">lagDuration</Code>, "300 seconds"],
              [<Code key="b">PERIOD_DURATION</Code>, "86,400 seconds"],
              [<Code key="c">withdrawalFee</Code>, "0"],
              [<Code key="d">claim(year, month, day, receiver)</Code>, "permissionless — pays the receiver, not the caller"],
            ]}
          />
          <P>
            The keeper drives the second phase. Because <Code>claim</Code> names its receiver rather
            than paying <Code>msg.sender</Code>, it can finish someone else&apos;s withdrawal without
            holding any authority over them — it spends its own gas handing a user their money.
          </P>
          <Note>
            Two things cost time to learn here. The date passed to <Code>claim</Code> must come from
            the <em>request&apos;s</em> period, not from <Code>getWithdrawalEpoch()</Code>, which
            reports the current one. And a claim inside the 300-second lag reverts with{" "}
            <Code>0x085de625</Code> — which reads like a permission error and is only impatience.
          </Note>

          {/* ---------------------------------------------------------------- */}
          <H2 id="recovery">Stuck-mint recovery</H2>
          <P>
            <Code>executeDirectMintingWithData</Code> is atomic: if anything reverts the whole Flare
            transaction rolls back — but the XRP has already left the wallet and is sitting at the
            Core Vault, and nothing on Flare will retry it. Smart Accounts documents a recovery
            protocol and expects the user to drive it by hand-crafting further XRPL payments.
          </P>
          <P>Tempo drives it. On a revert the relayer diagnoses from on-chain state:</P>
          <Table
            head={["On-chain state", "Meaning", "Response"]}
            rows={[
              [<Code key="a">isTransactionIdUsed</Code>, "false — still at the Core Vault", <>0xE0 skip-memo, then re-submit</>],
              ["used, nonce moved", "another executor got there first", "report success"],
              ["used, nonce unmoved", "minted, operation skipped", "0xE1 fast-forward"],
              [<Code key="d">DirectMintingDelayed</Code>, "rate-limited, not refused", "wait for executionAllowedAt, retry"],
            ]}
          />
          <P>
            Two rules shape this. A <strong>network error never triggers recovery</strong> — recovery
            costs a real XRPL payment, and spending one to fix a timeout is worse than the timeout.
            And nothing ever suggests resending: a second payment reuses the same nonce and strands
            itself too, which is the single worst move available and the one users reach for first.
          </P>
          <P>
            <Code>0xE2</Code> is <strong>not implemented</strong>. Its byte layout is published
            nowhere we could verify against, and guessing the layout of a memo that moves money
            strands funds rather than recovering them.
          </P>

          {/* ---------------------------------------------------------------- */}
          <H2 id="relayer">The relayer</H2>
          <P>
            It keeps no state. There is no database and no queue: a job is fully described by the
            XRPL transaction plus the user-operation bytes its memo committed to, and both are
            re-validated against the ledger on every step — destination, absence of a destination
            tag, memo opcode, and <Code>keccak256(data)</Code> against the commitment.
          </P>
          <P>
            Anyone can POST a job, so that validation is what makes statelessness safe rather than
            merely convenient: a forged job is refused before it costs any gas, and a tampered one
            only breaks its own relay. It also means a relay survives a redeploy, a cold start, or
            the browser being closed.
          </P>
          <P>
            Each step returns immediately. FDC round finality takes minutes, well past a serverless
            function&apos;s budget, so the caller polls rather than the function sleeping. The same
            endpoint serves the browser and a cron job.
          </P>

          {/* ---------------------------------------------------------------- */}
          <H2 id="api">HTTP API</H2>
          <Table
            head={["Endpoint", "Does"]}
            rows={[
              [<Code key="a">POST /api/orders</Code>, "Builds the user operation and sends the one XRPL payment"],
              [<Code key="b">POST /api/orders/cancel</Code>, "Cancels an order with a second XRPL payment"],
              [<Code key="c">POST /api/relay</Code>, "Advances one relay by one step; the caller holds the job"],
              [<Code key="d">POST /api/keeper</Code>, "Executes due orders and claims released withdrawals"],
              [<Code key="e">GET /api/state</Code>, "Orders, price, balances, pending withdrawals"],
              [<Code key="f">GET /api/price</Code>, "The FTSO XRP/USD reading alone, polled every 2.5s"],
              [<Code key="g">GET /api/history</Code>, "Market price history for the chart, proxied and cached from CoinGecko"],
            ]}
          />
          <Note>
            <Code>/api/orders</Code> is unauthenticated on the demo. Anyone with the URL can spend
            the demo wallet&apos;s testnet XRP and the relayer&apos;s C2FLR. Order size is capped
            server-side but not rate-limited. This is a deliberate trade for a frictionless judge
            experience and would not survive contact with mainnet.
          </Note>

          {/* ---------------------------------------------------------------- */}
          <H3>What the chart shows</H3>
          <P>
            The headline price is <strong>FTSO</strong>, because that is the only feed the contract
            triggers on. The 15-minute range plots our own oracle series, sampled every 2.5 seconds
            — higher resolution than any free market API offers at that scale, and the oracle price
            rather than a market average.
          </P>
          <P>
            Longer ranges plot market history from CoinGecko, with the live FTSO reading drawn over
            it as a dashed line. That pairing is deliberate: if the oracle and the market ever
            diverge, the chart shows it instead of quietly picking one. Charting only the market
            would let a target appear to be crossed while the contract disagreed.
          </P>

          <H2 id="contracts">Contracts</H2>
          <P>Coston2, chainId 114.</P>
          <Table
            head={["Contract", "Address"]}
            rows={CONTRACTS.map((c) => [
              c.name,
              <a
                key={c.address}
                href={`https://coston2-explorer.flare.network/address/${c.address}`}
                target="_blank"
                rel="noreferrer"
                className="break-all font-mono text-xs underline decoration-black/20 underline-offset-2 hover:decoration-black"
              >
                {c.address}
              </a>,
            ])}
          />
          <H3>Flare contracts Tempo builds on</H3>
          <Table
            head={["Contract", "Address"]}
            rows={FLARE_CONTRACTS.map((c) => [
              c.name,
              <span key={c.address} className="break-all font-mono text-xs">
                {c.address}
              </span>,
            ])}
          />
          <P>
            Addresses are resolved at runtime through <Code>FlareContractsRegistry</Code> rather than
            hardcoded, so a redeployment on Flare&apos;s side does not silently point Tempo at a dead
            contract.
          </P>

          {/* ---------------------------------------------------------------- */}
          <H2 id="running">Running it</H2>
          <Block>{`git clone --recursive <repo> && cd <repo>

# Contracts
cd contracts
forge test                                                             # 27 unit tests, offline
COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc forge test  # + 5 against live Coston2
FLARE_RPC_URL=https://flare-api.flare.network/ext/C/rpc forge test      # + 3 against mainnet

# App — landing, docs, demo, relayer, keeper
cd ../web
cp .env.example .env.local     # fill in RELAYER_PRIVATE_KEY and DEMO_XRPL_SEED
npm install && npm run dev`}</Block>
          <P>
            Fork tests report as <em>skipped</em> without an RPC URL rather than passing. A green
            tick on a test that never touched the chain is worse than no test.
          </P>

          {/* ---------------------------------------------------------------- */}
          <H2 id="limits">Limits</H2>
          <P>
            Stated rather than hidden. The full list, with reasoning, is in{" "}
            <a
              href="https://github.com/Zireaelst/Flare-Hackaton/blob/main/docs/security.md"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-black/20 underline-offset-2 hover:decoration-black"
            >
              docs/security.md
            </a>
            .
          </P>
          <ul className="mt-4 space-y-3 text-[15px] leading-relaxed text-black/70">
            <li>
              <strong>Swaps are sandwichable up to the slippage bound.</strong> The floor comes from
              FTSO rather than the caller, which stops a keeper giving the trade away outright, but
              2% minus pool fees is extractable by moving the pool inside the band.
            </li>
            <li>
              <strong>WHOLE_BALANCE authorizes a quantity the user has not seen.</strong> It takes
              the entire balance at the moment it fires, including funds added afterwards.
            </li>
            <li>
              <strong>The vault-share approval is unlimited</strong>, because the shares do not exist
              when the order is written and their count moves with yield.
            </li>
            <li>
              <strong>Permissionless is a property, not a market.</strong> Anyone may execute a due
              order; nobody is paid to. The safety argument does not depend on the keeper, the
              liveness argument does.
            </li>
            <li>
              <strong>SWAP_TO_STABLE cannot run on testnet.</strong> SparkDEX has no Coston2 or
              Coston deployment — verified by reading code size at its published addresses. The
              adapter rejects those orders at creation and is proven instead against the real
              mainnet pool on a fork.
            </li>
            <li>
              <strong>RedeemAdapter is the redeemer of record</strong>, so an agent default accrues
              to the adapter rather than the user. Handling it needs an FDC non-payment proof and
              per-request accounting.
            </li>
          </ul>

          <div className="mt-16 border-t border-black/8 pt-8">
            <Link
              href="/demo"
              className="inline-flex items-center gap-3 rounded-full bg-black px-7 py-3 text-base font-medium text-white transition-colors duration-200 hover:bg-gray-800"
            >
              Open the demo
            </Link>
          </div>
        </article>
      </main>

      <footer className="border-t border-black/8">
        <div className="mx-auto flex max-w-[88rem] flex-col gap-2 px-6 py-6 text-sm text-black/45 sm:flex-row sm:items-center sm:justify-between">
          <span>Tempo — Flare Summer Signal. Coston2 testnet.</span>
          <Link href="/" className="transition-colors duration-200 hover:text-black">
            Back to the overview
          </Link>
        </div>
      </footer>
    </>
  );
}
