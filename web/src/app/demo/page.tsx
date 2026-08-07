import Link from "next/link";
import { Nav } from "@/components/Chrome";
import { DemoConsole } from "./DemoConsole";

export const metadata = { title: "Tempo — Demo" };

export default function DemoPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="mb-9">
            <h1 className="font-heading text-4xl italic tracking-tight md:text-5xl">Live demo</h1>
            <p className="mt-3 max-w-2xl font-body text-sm font-light leading-relaxed text-white/55">
              Compose a standing order and watch one XRP payment become an FDC proof, an FXRP mint,
              and a live order — all on Coston2 and the XRPL testnet. Nothing here is simulated.
            </p>
          </div>
          <DemoConsole />
        </div>
      </main>

      {/* Deliberately plain: this page is a working surface, not a pitch. */}
      <footer className="mt-auto border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 font-body text-xs font-light text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <span>Tempo — Flare Summer Signal. Coston2 testnet.</span>
          <Link href="/" className="transition-colors hover:text-white/70">
            Back to the overview
          </Link>
        </div>
      </footer>
    </>
  );
}
