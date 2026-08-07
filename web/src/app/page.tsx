import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LogoIcon } from "@/components/LogoIcon";
import { Marquee } from "@/components/Marquee";
import CtaFooter from "@/components/CtaFooter";

/*
 * Third-party media. Reachable today and unsigned, but hosted in someone
 * else's bucket, so nothing here is load-bearing: every video sits behind a
 * solid background and the layout holds if it never arrives. Replace with
 * owned assets before submission.
 */
const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_161253_c72b1869-400f-45ed-ac0c-52f68c2ed5bd.mp4";
const USE_CASE_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_183428_ab5e672a-f608-4dcb-b319-f3e040f02e2d.mp4";
const CARD_IMAGE =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260423_164207_f243351d-ed59-48ec-83a0-a5e996bdbe3c.png&w=1280&q=85";

/** Each wordmark is set in a different face, so the row reads as logos rather than a list. */
const STACK = [
  { name: "XRP Ledger", style: { fontFamily: "Georgia, serif", fontWeight: 700, letterSpacing: "-0.02em", fontSize: "15px" } },
  { name: "SMART ACCOUNTS", style: { fontFamily: "Arial, sans-serif", fontWeight: 900, letterSpacing: "0.08em", fontSize: "13px" } },
  { name: "FAssets", style: { fontFamily: "'Trebuchet MS', sans-serif", fontWeight: 600, letterSpacing: "0.01em", fontSize: "15px", fontStyle: "italic" } },
  { name: "FTSO V2", style: { fontFamily: "'Courier New', monospace", fontWeight: 700, letterSpacing: "0.12em", fontSize: "13px" } },
  { name: "Flare Data Connector", style: { fontFamily: "Palatino, 'Book Antiqua', serif", fontWeight: 400, letterSpacing: "-0.01em", fontSize: "16px" } },
  { name: "SparkDEX", style: { fontFamily: "Impact, 'Arial Narrow', sans-serif", fontWeight: 400, letterSpacing: "0.04em", fontSize: "14px" } },
  { name: "Coston2", style: { fontFamily: "Verdana, sans-serif", fontWeight: 700, letterSpacing: "-0.03em", fontSize: "13px" } },
];

/** What has actually been executed on chain — the strongest thing we own. */
const PROVEN = [
  { name: "One payment, two orders", style: { fontFamily: "'Times New Roman', serif", fontWeight: 400, letterSpacing: "0.02em", fontSize: "14px" } },
  { name: "EXIT DISARMS THE PLAN", style: { fontFamily: "'Arial Black', sans-serif", fontWeight: 900, letterSpacing: "0.08em", fontSize: "16px" } },
  { name: "Two-phase withdrawal", style: { fontFamily: "Impact, sans-serif", fontWeight: 700, letterSpacing: "0.05em", fontSize: "18px" } },
  { name: "Stuck-mint recovery", style: { fontFamily: "Georgia, serif", fontWeight: 600, letterSpacing: "-0.02em", fontSize: "17px" } },
  { name: "9.95 XRP home", style: { fontFamily: "Helvetica, sans-serif", fontWeight: 700, letterSpacing: "-0.01em", fontSize: "15px" } },
  { name: "35 TESTS PASSING", style: { fontFamily: "Verdana, sans-serif", fontWeight: 700, letterSpacing: "0.06em", fontSize: "14px" } },
  { name: "FTSO-bounded fills", style: { fontFamily: "'Courier New', monospace", fontWeight: 700, letterSpacing: "0.18em", fontSize: "14px" } },
  { name: "Permissionless", style: { fontFamily: "Palatino, serif", fontWeight: 500, letterSpacing: "0.03em", fontSize: "15px" } },
];

const NAV_LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Order types", href: "#orders" },
  { label: "Proven", href: "#proven" },
  { label: "Contracts", href: "#contracts" },
  { label: "Docs", href: "/docs" },
];

function PillButton({
  href,
  children,
  external,
  size = "base",
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  size?: "base" | "lg";
}) {
  const className = `inline-flex items-center gap-3 bg-black text-white font-medium pl-8 pr-2 py-2 rounded-full hover:bg-gray-800 transition-colors duration-200 ${
    size === "lg" ? "text-base md:text-lg" : "text-base"
  }`;
  const inner = (
    <>
      {children}
      <span className="bg-white rounded-full p-2">
        <ArrowRight className="w-5 h-5 text-black" />
      </span>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

function Navbar() {
  return (
    <nav className="absolute top-0 left-0 right-0 z-20 px-6 py-5">
      <div className="max-w-[88rem] mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoIcon className="w-7 h-7 text-black" />
          <span className="text-2xl font-medium tracking-tight text-black">Tempo</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-base text-gray-700 hover:text-black font-medium transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
        </div>

        <Link
          href="/demo"
          className="bg-black text-white text-base font-medium px-7 py-2.5 rounded-full hover:bg-gray-800 transition-colors duration-200"
        >
          Open demo
        </Link>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="flex-1 px-6 pt-20 pb-6 flex items-end">
      <div
        className="relative w-full rounded-2xl overflow-hidden bg-[#E4E2DD]"
        style={{ height: "calc(100vh - 96px)" }}
      >
        <video
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
          className="object-cover absolute inset-0 w-full h-full"
          src={HERO_VIDEO}
        />

        <div className="relative z-10 flex flex-col items-start justify-start h-full p-12 pt-36">
          <h1
            className="text-black text-5xl md:text-6xl font-medium leading-tight max-w-xl mb-4"
            style={{ letterSpacing: "-0.04em" }}
          >
            Your XRP
            <br />
            Keeps Working
          </h1>
          <p className="text-black/70 text-base md:text-lg max-w-md mb-8 leading-relaxed">
            One XRP payment sets a standing order on Flare — and the exit that unwinds it. No FLR,
            no EVM wallet, no bridge, and nothing left in our custody.
          </p>

          <PillButton href="/demo" size="lg">
            Try the demo
          </PillButton>

          <div className="mt-24 w-full max-w-md overflow-hidden">
            <Marquee items={STACK} trackClassName="marquee-track" itemClassName="mx-7" />
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoSection() {
  return (
    <section id="orders" className="bg-[#F5F5F5] px-6 py-24">
      <div className="max-w-[88rem] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16 items-start">
          <div>
            <h2
              className="text-black text-4xl md:text-5xl font-medium leading-tight mb-8"
              style={{ letterSpacing: "-0.03em" }}
            >
              Meet Tempo.
            </h2>
            <PillButton href="#how">Discover it</PillButton>
          </div>
          <p className="text-black/70 text-2xl md:text-3xl leading-relaxed">
            Flare solved getting into DeFi from an XRPL wallet. Tempo is what gets you back out —
            on a schedule, or the moment a price is hit.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            className="lg:col-span-2 rounded-2xl bg-[#DFE3DA]"
            style={{
              backgroundImage: `url("${CARD_IMAGE}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="p-7 min-h-80 flex flex-col justify-between">
              <h3
                className="text-black text-2xl font-medium leading-snug"
                style={{ letterSpacing: "-0.02em" }}
              >
                Savings that bloom
              </h3>
              <p className="text-black/70 text-base max-w-xs">
                Dollar-cost average into a Flare yield vault over weeks, from a single XRP payment
                you sign once.
              </p>
            </div>
          </div>

          <div className="bg-[#2B2644] rounded-2xl p-7 min-h-80 flex flex-col justify-between">
            <h3 className="text-white text-2xl font-medium leading-snug" style={{ letterSpacing: "-0.02em" }}>
              Always yours,
              <br />
              never ours.
            </h3>
            <p className="text-white/60 text-base">
              An order is backed by an allowance, not a deposit. Your FXRP never leaves your own
              account, and cancelling costs nothing.
            </p>
          </div>

          <div className="bg-[#2B2644] rounded-2xl p-7 min-h-80 flex flex-col justify-between">
            <h3 className="text-white text-2xl font-medium leading-snug" style={{ letterSpacing: "-0.02em" }}>
              Exits that
              <br />
              finish themselves
            </h3>
            <p className="text-white/60 text-base">
              Leaving a Flare vault takes a request, a wait and a separate claim. Tempo drives all
              three while you sleep.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProvenSection() {
  return (
    <section id="proven" className="bg-[#F5F5F5] px-6">
      <div className="max-w-[88rem] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 items-center">
        <p className="text-black/70 text-base leading-relaxed">
          Executed on Coston2 and the XRPL testnet,
          <br />
          not drawn on a slide.
        </p>
        <div className="md:col-span-3 overflow-hidden">
          <Marquee items={PROVEN} trackClassName="backers-track" itemClassName="mx-10" muted />
        </div>
      </div>
    </section>
  );
}

function UseCasesSection() {
  return (
    <section id="how" className="bg-[#F5F5F5] px-6 py-24">
      <div className="max-w-[88rem] mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div className="md:pr-12 md:pt-2">
          <p className="text-black/60 text-sm mb-2">Tempo in practice</p>
          <h2
            className="text-5xl md:text-6xl font-medium leading-none mb-6"
            style={{ letterSpacing: "-0.04em" }}
          >
            Use modes
          </h2>
          <p className="text-black/60 text-base leading-relaxed max-w-sm">
            One payment can schedule, protect and unwind a position. The trigger is re-derived
            on-chain from FTSO every time, so whoever executes it supplies nothing but an order id.
          </p>
        </div>

        <div className="relative rounded-3xl overflow-hidden min-h-[720px] bg-[#DDE1E6]">
          <video
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
            className="object-cover absolute inset-0 w-full h-full"
            src={USE_CASE_VIDEO}
          />
          <div className="relative z-10 p-10 md:p-12">
            <h3
              className="text-4xl md:text-5xl font-medium leading-tight mb-5"
              style={{ letterSpacing: "-0.03em" }}
            >
              Treasuries
            </h3>
            <p className="text-black/70 text-base max-w-md mb-8">
              Sweep idle XRP into yield on a schedule and pull it back when a price is hit — without
              holding FLR, running a bot, or handing custody to anyone. The keeper is a convenience,
              never an authority.
            </p>
            <Link href="/demo" className="group inline-flex items-center gap-3 text-black font-medium">
              <span className="w-9 h-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center group-hover:bg-white transition-colors">
                <ArrowRight className="w-4 h-4 text-black" />
              </span>
              Know more
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const CONTRACTS = [
  { name: "Tempo", address: "0x5B281A91b54bd2E43f9f39A5AEF0CC7BbF15Fb6D" },
  { name: "VaultDepositAdapter", address: "0xfcBDC27153263A90FAa3ffed4aB25FACC6351a59" },
  { name: "VaultWithdrawAdapter", address: "0x48b4B2796f051041d393aD2d1B615D21419EC7de" },
  { name: "RedeemAdapter", address: "0x22eB0F7075481eCB8c3b544d8ee8101400e6a47A" },
  { name: "SwapAdapter", address: "0x47E5dEBF37a1201FB77a23E6C7872940C7b713fc" },
];

function ContractsSection() {
  return (
    <section id="contracts" className="bg-[#F5F5F5] px-6 pb-24">
      <div className="max-w-[88rem] mx-auto">
        <h2
          className="text-4xl md:text-5xl font-medium leading-tight mb-3"
          style={{ letterSpacing: "-0.03em" }}
        >
          Live on Coston2.
        </h2>
        <p className="text-black/60 text-base mb-10">
          chainId 114 &middot; every address below is deployed and verifiable
        </p>

        <div className="rounded-2xl overflow-hidden border border-black/8 bg-white">
          {CONTRACTS.map((contract, index) => (
            <a
              key={contract.name}
              href={`https://coston2-explorer.flare.network/address/${contract.address}`}
              target="_blank"
              rel="noreferrer"
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-5 hover:bg-black/[0.03] transition-colors ${
                index > 0 ? "border-t border-black/8" : ""
              }`}
            >
              <span className="text-base font-medium">{contract.name}</span>
              <span className="font-mono text-xs text-black/50 break-all">{contract.address}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <div className="h-screen flex flex-col overflow-hidden">
        <Navbar />
        <Hero />
      </div>

      <InfoSection />
      <ProvenSection />
      <UseCasesSection />
      <ContractsSection />
      <CtaFooter />
    </>
  );
}
