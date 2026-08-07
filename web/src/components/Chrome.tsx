import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <TempoMark />
          <span className="font-heading text-[19px] italic tracking-tight">Tempo</span>
        </Link>
        <nav className="flex items-center gap-6 font-body text-sm text-white/50">
          <a
            href="https://github.com/Zireaelst/Flare-Hackaton"
            target="_blank"
            rel="noreferrer"
            className="hidden transition-colors hover:text-white sm:block"
          >
            GitHub
          </a>
          <Link
            href="/demo"
            className="liquid-glass-strong flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium text-white transition-all hover:bg-white/10"
          >
            Try demo
            <ArrowUpRight className="h-4 w-4" />
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
      <rect x="1" y="7" width="3" height="6" rx="1.5" fill="var(--color-accent)" opacity="0.5" />
      <rect x="8" y="3" width="3" height="14" rx="1.5" fill="var(--color-accent)" />
      <rect x="15" y="6" width="3" height="8" rx="1.5" fill="var(--color-accent)" opacity="0.7" />
    </svg>
  );
}
