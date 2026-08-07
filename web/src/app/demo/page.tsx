import Link from "next/link";
import { Nav } from "@/components/Chrome";
import { DemoConsole } from "./DemoConsole";

export const metadata = { title: "Tempo — Demo" };

export default function DemoPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-[88rem] px-6 py-12">
          <div className="mb-9">
            <h1 className="text-4xl font-medium md:text-5xl"
              style={{ letterSpacing: "-0.03em" }}>Live demo</h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-black/60">
              Compose a standing order and watch one XRP payment become an FDC proof, an FXRP mint,
              and a live order — all on Coston2 and the XRPL testnet. Nothing here is simulated.
            </p>
          </div>
          <DemoConsole />
        </div>
      </main>

      {/* Deliberately plain: this page is a working surface, not a pitch. */}
      <footer className="mt-auto border-t border-black/8">
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
