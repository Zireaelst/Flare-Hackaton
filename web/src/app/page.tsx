import Link from "next/link";
import { Footer, Nav } from "@/components/Chrome";

const ORDER_TYPES = [
  {
    name: "Schedule",
    trigger: "Every interval, N times",
    body: "Dollar-cost average into a yield vault over weeks, from one payment.",
  },
  {
    name: "Take profit",
    trigger: "XRP/USD rises to your target",
    body: "Redeem back to your XRPL address the moment the price is hit.",
  },
  {
    name: "Stop loss",
    trigger: "XRP/USD falls to your target",
    body: "Exit without watching a chart or trusting a centralised bot.",
  },
];

const STACK = [
  { name: "Smart Accounts", role: "The entry point. One XRP payment, no FLR, no EVM wallet." },
  { name: "FAssets / FXRP", role: "The asset being scheduled, and native redemption back to XRPL." },
  { name: "FTSO v2", role: "The price trigger itself — remove it and two order types cease to exist." },
  { name: "FDC", role: "The XRPPayment attestation that proves your payment to Flare." },
];

const CONTRACTS = [
  { name: "Tempo", address: "0xdf0D7Be968D27E7533e3b15b7e854Ee2357Efdf7" },
  { name: "VaultDepositAdapter", address: "0x7986aAC8d716970d1393bFF27bE4001DA52eb84a" },
  { name: "RedeemAdapter", address: "0xE5005FDF2C8FCF6fb55F6014b69D0C68e4e66E85" },
];

export default function Home() {
  return (
    <>
      <Nav />

      <main className="relative flex-1">
        <div className="aurora" />
        <div className="grid-lines absolute inset-x-0 top-0 h-[600px]" />

        {/* Hero */}
        <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Live on Coston2 testnet
            </span>

            <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
              Programmable XRP.
              <br />
              <span className="text-accent">One payment away.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-balance text-lg leading-relaxed text-muted">
              XRPL can send a payment. It cannot say <em>later</em>, and it cannot say <em>if</em>.
              Tempo lets one XRP payment register a standing order on Flare that executes on a
              schedule or a price — with no FLR, no EVM wallet, and no bridge.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/demo"
                className="w-full rounded-full bg-accent px-7 py-3 text-sm font-medium text-black transition-opacity hover:opacity-90 sm:w-auto"
              >
                Try the demo
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="w-full rounded-full border border-line bg-surface px-7 py-3 text-sm font-medium transition-colors hover:border-muted sm:w-auto"
              >
                Read the code
              </a>
            </div>
          </div>
        </section>

        {/* The gap */}
        <section className="relative mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
            <div className="bg-surface p-8">
              <h2 className="text-sm font-medium uppercase tracking-wider text-muted">
                What Smart Accounts solved
              </h2>
              <p className="mt-4 text-lg leading-relaxed">
                One XRPL payment can already trigger arbitrary logic on Flare, with no FLR and no
                EVM wallet. The <span className="text-foreground">authorization</span> gap is
                closed.
              </p>
            </div>
            <div className="bg-surface p-8">
              <h2 className="text-sm font-medium uppercase tracking-wider text-accent">
                What was still missing
              </h2>
              <p className="mt-4 text-lg leading-relaxed">
                That operation runs <span className="text-foreground">once</span>, immediately,
                atomically with the mint. The <span className="text-foreground">time</span> gap
                stayed open — no schedules, no conditions, no &ldquo;when the price hits&rdquo;.
              </p>
            </div>
          </div>

          <p className="mx-auto mt-10 max-w-2xl text-balance text-center text-lg leading-relaxed text-muted">
            Tempo&apos;s idea is one line long:{" "}
            <span className="text-foreground">
              the user operation registers an order instead of performing an action.
            </span>{" "}
            That is how you get deferred execution from a primitive that has none.
          </p>
        </section>

        {/* Order types */}
        <section className="relative mx-auto max-w-6xl px-6 pb-24">
          <h2 className="text-2xl font-semibold tracking-tight">Three orders, one payment each</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {ORDER_TYPES.map((order) => (
              <div key={order.name} className="rounded-2xl border border-line bg-surface p-6">
                <h3 className="text-lg font-medium">{order.name}</h3>
                <p className="mt-1 font-mono text-xs text-accent">{order.trigger}</p>
                <p className="mt-4 text-sm leading-relaxed text-muted">{order.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="relative mx-auto max-w-6xl px-6 pb-24">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>

          <ol className="mt-8 space-y-px overflow-hidden rounded-2xl border border-line bg-line">
            {[
              {
                step: "You send one XRP payment",
                body: "Untagged, to the FAssets Core Vault, carrying a 42-byte memo that commits to your order.",
              },
              {
                step: "Flare proves it happened",
                body: "The relayer fetches an FDC XRPPayment attestation — a real proof, not a trusted bridge.",
              },
              {
                step: "Mint and order, atomically",
                body: "FXRP is minted into your personal account, which approves Tempo and registers the order in the same transaction.",
              },
              {
                step: "Anyone can execute it",
                body: "When the trigger is met, any address may execute. Tempo re-checks the price and the clock on-chain, so the keeper is a convenience, never an authority.",
              },
            ].map((item, index) => (
              <li key={item.step} className="flex gap-5 bg-surface p-6">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line font-mono text-xs text-accent">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-medium">{item.step}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-2xl border border-line bg-accent-soft p-6">
            <p className="text-sm leading-relaxed">
              <span className="font-medium text-accent">Your funds never leave your account.</span>{" "}
              An order is backed by an allowance, not a deposit. Tempo holds no balance between
              executions, and cancelling costs you nothing.
            </p>
          </div>
        </section>

        {/* Stack */}
        <section className="relative mx-auto max-w-6xl px-6 pb-24">
          <h2 className="text-2xl font-semibold tracking-tight">Built on four Flare protocols</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {STACK.map((item) => (
              <div key={item.name} className="rounded-2xl border border-line bg-surface p-6">
                <h3 className="font-medium">{item.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.role}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Contracts */}
        <section className="relative mx-auto max-w-6xl px-6 pb-24">
          <h2 className="text-2xl font-semibold tracking-tight">Deployed on Coston2</h2>
          <p className="mt-2 text-sm text-muted">chainId 114 · everything below is live and verifiable</p>

          <div className="mt-8 overflow-hidden rounded-2xl border border-line">
            {CONTRACTS.map((contract, index) => (
              <a
                key={contract.name}
                href={`https://coston2-explorer.flare.network/address/${contract.address}`}
                target="_blank"
                rel="noreferrer"
                className={`flex flex-col justify-between gap-1 bg-surface p-5 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center ${
                  index > 0 ? "border-t border-line" : ""
                }`}
              >
                <span className="font-medium">{contract.name}</span>
                <span className="break-all font-mono text-xs text-muted">{contract.address}</span>
              </a>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="relative mx-auto max-w-6xl px-6 pb-28">
          <div className="rounded-3xl border border-line bg-surface p-12 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">See it run on testnet</h2>
            <p className="mx-auto mt-3 max-w-lg text-balance text-muted">
              Compose an order, watch one XRP payment turn into an FDC proof, an FXRP mint, and a
              live standing order — end to end, on chain.
            </p>
            <Link
              href="/demo"
              className="mt-8 inline-block rounded-full bg-accent px-8 py-3 text-sm font-medium text-black transition-opacity hover:opacity-90"
            >
              Try the demo
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
