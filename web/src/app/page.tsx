import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Nav } from "@/components/Chrome";
import CtaFooter from "@/components/CtaFooter";

const ORDERS = [
  {
    name: "Schedule",
    trigger: "every interval, N times",
    body: "Dollar-cost average into a yield vault over weeks, from a single payment.",
  },
  {
    name: "Exit",
    trigger: "XRP/USD crosses your target",
    body: "Unwind the whole position — including the two-phase withdrawal these vaults require.",
  },
  {
    name: "Redeem",
    trigger: "on a schedule or a price",
    body: "Send FXRP back to your XRPL address through native FAssets redemption.",
  },
];

const STACK = [
  { name: "Smart Accounts", role: "One XRP payment, no FLR, no EVM wallet, no bridge." },
  { name: "FAssets / FXRP", role: "The asset being scheduled, and native redemption home." },
  { name: "FTSO v2", role: "The trigger itself — and the floor a swap will accept." },
  { name: "FDC", role: "An XRPPayment attestation proving your payment to Flare." },
];

const PROVEN = [
  {
    label: "One payment, two orders",
    body: "A plan and the exit that protects it, created together before a single vault share exists.",
  },
  {
    label: "The exit disarms the plan",
    body: "Order #6 unwound the position and left order #5 cancelled at 1/3, on chain.",
  },
  {
    label: "Two-phase withdrawal, closed",
    body: "The vault queued 5 FXRP and released it after its lag; the keeper claimed it back for the user.",
  },
  {
    label: "Home to the XRP Ledger",
    body: "10 FXRP redeemed, 9.95 XRP arrived at the XRPL address. The circle closes.",
  },
];

const CONTRACTS = [
  { name: "Tempo", address: "0x5B281A91b54bd2E43f9f39A5AEF0CC7BbF15Fb6D" },
  { name: "VaultDepositAdapter", address: "0xfcBDC27153263A90FAa3ffed4aB25FACC6351a59" },
  { name: "VaultWithdrawAdapter", address: "0x48b4B2796f051041d393aD2d1B615D21419EC7de" },
  { name: "RedeemAdapter", address: "0x22eB0F7075481eCB8c3b544d8ee8101400e6a47A" },
  { name: "SwapAdapter", address: "0x47E5dEBF37a1201FB77a23E6C7872940C7b713fc" },
];

export default function Home() {
  return (
    <>
      <Nav />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden px-6 pb-28 pt-24 md:px-16 lg:px-24">
          <div className="grid-lines pointer-events-none absolute inset-x-0 top-0 h-[560px]" />

          <div className="relative mx-auto max-w-4xl text-center">
            <span className="liquid-glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-body text-xs text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Live on Coston2 testnet
            </span>

            <h1 className="mt-7 font-heading text-6xl italic leading-[0.85] tracking-tight md:text-7xl lg:text-8xl">
              Programmable XRP.
              <br />
              <span className="text-accent">One payment away.</span>
            </h1>

            <p className="mx-auto mt-7 max-w-xl font-body text-base font-light leading-relaxed text-white/60 md:text-lg">
              XRPL can send a payment. It cannot say <em>later</em>, and it cannot say <em>if</em>.
              Tempo lets one XRP payment register a standing order on Flare — and the exit that
              unwinds it.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/demo"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-3 font-body text-sm font-medium text-black transition-colors hover:bg-white/90 sm:w-auto"
              >
                Try the demo
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <a
                href="https://github.com/Zireaelst/Flare-Hackaton"
                target="_blank"
                rel="noreferrer"
                className="liquid-glass-strong flex w-full items-center justify-center gap-2 rounded-full px-7 py-3 font-body text-sm font-medium text-white transition-all hover:bg-white/10 sm:w-auto"
              >
                Read the code
                <ArrowUpRight className="h-5 w-5" />
              </a>
            </div>
          </div>
        </section>

        {/* The gap */}
        <section className="px-6 pb-28 md:px-16 lg:px-24">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="liquid-glass rounded-3xl p-8">
                <h2 className="font-body text-xs uppercase tracking-[0.2em] text-white/40">
                  Flare solved getting in
                </h2>
                <p className="mt-4 font-body text-lg leading-relaxed text-white/80">
                  Smart Accounts v1.3 moves XRP into a curated vault with one XRPL signature. Over
                  40 million XRP has already gone that way.
                </p>
              </div>
              <div className="liquid-glass rounded-3xl p-8">
                <h2 className="font-body text-xs uppercase tracking-[0.2em] text-accent">
                  Nobody solved getting out
                </h2>
                <p className="mt-4 font-body text-lg leading-relaxed text-white/80">
                  Leaving means noticing the moment yourself, sending another payment, waiting out
                  the vault&apos;s lag, then sending a third transaction to claim.
                </p>
              </div>
            </div>

            <p className="mx-auto mt-12 max-w-2xl text-center font-heading text-2xl italic leading-snug text-white/90 md:text-3xl">
              The user operation registers an order instead of performing an action. That is how
              you get deferred execution from a primitive that has none.
            </p>
          </div>
        </section>

        {/* Order types */}
        <section className="px-6 pb-28 md:px-16 lg:px-24">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-heading text-4xl italic tracking-tight md:text-5xl">
              What one payment can set
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {ORDERS.map((order) => (
                <div key={order.name} className="liquid-glass rounded-3xl p-7">
                  <h3 className="font-heading text-2xl italic">{order.name}</h3>
                  <p className="mt-1.5 font-body text-xs text-accent">{order.trigger}</p>
                  <p className="mt-4 font-body text-sm font-light leading-relaxed text-white/60">
                    {order.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="liquid-glass mt-4 rounded-3xl p-7">
              <p className="font-body text-sm leading-relaxed text-white/70">
                <span className="text-accent">Your funds never leave your account.</span> An order
                is backed by an allowance, not a deposit. Tempo holds no balance between
                executions, and cancelling costs nothing.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-6 pb-28 md:px-16 lg:px-24">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-heading text-4xl italic tracking-tight md:text-5xl">How it works</h2>
            <ol className="mt-10 space-y-3">
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
                  step: "Mint and orders, atomically",
                  body: "FXRP is minted into your personal account, which approves Tempo and registers both the plan and its exit in the same transaction.",
                },
                {
                  step: "Anyone can execute it",
                  body: "Tempo re-derives the price and the clock on-chain. The keeper supplies nothing but an order id, so it can make an order late — never wrong.",
                },
              ].map((item, index) => (
                <li key={item.step} className="liquid-glass flex gap-5 rounded-2xl p-6">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 font-body text-xs text-accent">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-body font-medium">{item.step}</h3>
                    <p className="mt-1.5 font-body text-sm font-light leading-relaxed text-white/55">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Proven */}
        <section className="px-6 pb-28 md:px-16 lg:px-24">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-heading text-4xl italic tracking-tight md:text-5xl">
              Proven on chain, not in a slide
            </h2>
            <p className="mt-3 max-w-2xl font-body text-sm font-light text-white/50">
              Every leg below was executed on Coston2 and the XRPL testnet. The only action not
              exercised there is the stablecoin swap, because SparkDEX has no testnet deployment —
              that one is proven against the real mainnet pool on a fork.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {PROVEN.map((item) => (
                <div key={item.label} className="liquid-glass rounded-3xl p-7">
                  <h3 className="font-body text-sm font-medium text-accent">{item.label}</h3>
                  <p className="mt-2.5 font-body text-sm font-light leading-relaxed text-white/60">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stack */}
        <section className="px-6 pb-28 md:px-16 lg:px-24">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-heading text-4xl italic tracking-tight md:text-5xl">
              Four Flare protocols, none decorative
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {STACK.map((item) => (
                <div key={item.name} className="liquid-glass rounded-3xl p-7">
                  <h3 className="font-body font-medium">{item.name}</h3>
                  <p className="mt-2 font-body text-sm font-light leading-relaxed text-white/55">
                    {item.role}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contracts */}
        <section className="px-6 pb-28 md:px-16 lg:px-24">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-heading text-4xl italic tracking-tight md:text-5xl">
              Deployed on Coston2
            </h2>
            <p className="mt-3 font-body text-sm font-light text-white/50">
              chainId 114 &middot; every address below is live and verifiable
            </p>

            <div className="liquid-glass mt-10 overflow-hidden rounded-3xl">
              {CONTRACTS.map((contract, index) => (
                <a
                  key={contract.name}
                  href={`https://coston2-explorer.flare.network/address/${contract.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex flex-col justify-between gap-1 p-5 transition-colors hover:bg-white/5 sm:flex-row sm:items-center ${
                    index > 0 ? "border-t border-white/8" : ""
                  }`}
                >
                  <span className="font-body text-sm font-medium">{contract.name}</span>
                  <span className="break-all font-mono text-xs text-white/40">
                    {contract.address}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <CtaFooter />
    </>
  );
}
