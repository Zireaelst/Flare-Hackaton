import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

/*
 * Stand-in for TT Norms Pro, which is a paid licence not present in this repo.
 * Self-hosted at build time, so there is no third-party request on first paint
 * and no flash of a fallback face.
 */
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tempo — Your XRP, working",
  description:
    "Conditional and recurring execution for XRPL holders on Flare. One XRP payment sets a standing order and the exit that unwinds it. No FLR, no EVM wallet, no bridge.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} antialiased`}>
      <body className="flex flex-col bg-[#F5F5F5]">{children}</body>
    </html>
  );
}
