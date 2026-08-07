import type { Metadata } from "next";
import { Instrument_Serif, Barlow } from "next/font/google";
import "./globals.css";

/*
 * Loaded through next/font rather than a <link> to Google: the files are
 * self-hosted at build time, so there is no third-party request on first paint
 * and no layout shift while the display face arrives.
 */
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tempo — Programmable XRP, one payment away",
  description:
    "Conditional and recurring execution for XRPL holders on Flare. One XRP payment sets a standing order — and the exit that unwinds it. No FLR, no EVM wallet, no bridge.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${barlow.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
