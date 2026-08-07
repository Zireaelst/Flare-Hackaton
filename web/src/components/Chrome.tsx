import Link from "next/link";
import { LogoIcon } from "./LogoIcon";

/** The demo's header. Solid rather than transparent — this page scrolls. */
export function Nav() {
  return (
    <header className="border-b border-black/8 bg-[#F5F5F5]">
      <div className="mx-auto flex max-w-[88rem] items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoIcon className="h-7 w-7 text-black" />
          <span className="text-2xl font-medium tracking-tight text-black">Tempo</span>
        </Link>
        <nav className="flex items-center gap-8">
          <Link
            href="/docs"
            className="text-base font-medium text-gray-700 transition-colors duration-200 hover:text-black"
          >
            Docs
          </Link>
          <a
            href="https://github.com/Zireaelst/Flare-Hackaton"
            target="_blank"
            rel="noreferrer"
            className="hidden text-base font-medium text-gray-700 transition-colors duration-200 hover:text-black sm:block"
          >
            GitHub
          </a>
          <Link
            href="/"
            className="rounded-full bg-black px-7 py-2.5 text-base font-medium text-white transition-colors duration-200 hover:bg-gray-800"
          >
            Overview
          </Link>
        </nav>
      </div>
    </header>
  );
}
