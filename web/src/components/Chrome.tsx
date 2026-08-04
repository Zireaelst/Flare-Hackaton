import Link from "next/link";

export function Nav() {
  return (
    <header className="relative z-10 border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <TempoMark />
          <span className="text-[15px] font-semibold tracking-tight">Tempo</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-muted">
          <a
            href="https://dev.flare.network/smart-accounts/overview"
            target="_blank"
            rel="noreferrer"
            className="hidden transition-colors hover:text-foreground sm:block"
          >
            Smart Accounts
          </a>
          <Link
            href="/demo"
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-black transition-opacity hover:opacity-90"
          >
            Try demo
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** Three bars on a beat — the name, drawn. */
export function TempoMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <rect x="1" y="7" width="3" height="6" rx="1.5" fill="var(--accent)" opacity="0.5" />
      <rect x="8" y="3" width="3" height="14" rx="1.5" fill="var(--accent)" />
      <rect x="15" y="6" width="3" height="8" rx="1.5" fill="var(--accent)" opacity="0.7" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>Tempo — built for Flare Summer Signal. Coston2 testnet.</span>
        <span className="font-mono">
          Tempo{" "}
          <a
            href="https://coston2-explorer.flare.network/address/0xdf0D7Be968D27E7533e3b15b7e854Ee2357Efdf7"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            0xdf0D…Efdf7
          </a>
        </span>
      </div>
    </footer>
  );
}
