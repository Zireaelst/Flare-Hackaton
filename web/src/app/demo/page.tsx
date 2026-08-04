import { Footer, Nav } from "@/components/Chrome";
import { DemoConsole } from "./DemoConsole";

export const metadata = { title: "Tempo — Demo" };

export default function DemoPage() {
  return (
    <>
      <Nav />
      <main className="relative flex-1">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight">Live demo</h1>
            <p className="mt-2 max-w-2xl text-muted">
              Compose a standing order and watch one XRP payment become an FDC proof, an FXRP mint,
              and a live order — all on Coston2 and the XRPL testnet.
            </p>
          </div>
          <DemoConsole />
        </div>
      </main>
      <Footer />
    </>
  );
}
