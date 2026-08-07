"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Hls from "hls.js";

/**
 * Drop an MP4 at `web/public/cta-background.mp4` and it plays. Nothing else to
 * configure, nothing that expires.
 *
 * Preferred over the HLS source below because it is ours: no third party, no
 * signed URL, no CDN that can decide otherwise on judging day.
 */
const LOCAL_SRC = "/cta-background.mp4";

/**
 * Fallback, and decoration only.
 *
 * A signed third-party Mux URL whose signature expires 2026-08-14 — the day
 * before judging opens. It also does not currently buffer in Chrome despite the
 * manifest and renditions both returning 200, which is reason enough not to
 * build a layout on it. When it fails the video never fades in and
 * `.cinematic-bg` carries the section.
 */
const HLS_SRC = "https://stream.mux.com/8wrHPCX2dC3msyYU9ObwqNdm00u3ViXvOSHUMRYSEe5Q.m3u8";

const FOOTER_LINKS = [
  { label: "Contracts", href: "https://coston2-explorer.flare.network/address/0x5B281A91b54bd2E43f9f39A5AEF0CC7BbF15Fb6D" },
  { label: "Security", href: "https://github.com/Zireaelst/Flare-Hackaton/blob/main/docs/security.md" },
  { label: "GitHub", href: "https://github.com/Zireaelst/Flare-Hackaton" },
];

const CtaFooter = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Fade in only once frames actually exist. MANIFEST_PARSED fires while the
    // element is still blank, so keying off it reveals an empty video and hides
    // the background that was doing the work.
    const reveal = () => setVideoReady(true);
    video.addEventListener("playing", reveal);

    // `autoPlay` alone is unreliable when the source is a MediaSource rather
    // than a URL, so ask explicitly. A rejection means the browser refused
    // autoplay, which is a reason to stay on the background, not an error.
    const start = () => void video.play().catch(() => setVideoReady(false));

    let cancelled = false;
    let hlsInstance: Hls | null = null;

    // A self-hosted file wins if one is present. HEAD rather than optimism, so
    // a missing file costs one request instead of a broken player.
    void fetch(LOCAL_SRC, { method: "HEAD" })
      .then((response) => {
        if (cancelled) return;
        if (response.ok && response.headers.get("content-type")?.startsWith("video")) {
          video.src = LOCAL_SRC;
          start();
          return;
        }
        hlsInstance = attachHls(video, start, () => setVideoReady(false));
      })
      .catch(() => {
        if (!cancelled) hlsInstance = attachHls(video, start, () => setVideoReady(false));
      });

    return () => {
      cancelled = true;
      video.removeEventListener("playing", reveal);
      hlsInstance?.destroy();
    };
  }, []);

  return renderSection(videoRef, videoReady);
};

/** Wire the HLS fallback, returning the instance so it can be torn down. */
function attachHls(video: HTMLVideoElement, onReady: () => void, onFatal: () => void): Hls | null {
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(HLS_SRC);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, onReady);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        onFatal();
        hls.destroy();
      }
    });
    return hls;
  }

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    // Safari plays HLS natively.
    video.src = HLS_SRC;
    video.addEventListener("loadedmetadata", onReady, { once: true });
  }
  return null;
}

function renderSection(videoRef: React.RefObject<HTMLVideoElement | null>, videoReady: boolean) {
  return (
    <section className="relative overflow-hidden px-6 py-32 text-center md:px-16 lg:px-24">
      {/*
        Always present. The video is an enhancement on top of this, never the
        thing the layout depends on — see the note in globals.css about the
        stream's signature expiring before judging.
      */}
      <div className="cinematic-bg absolute inset-0 z-0" aria-hidden />

      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden
        className={`absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-1000 ${
          videoReady ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-[1]"
        style={{ height: "200px", background: "linear-gradient(to bottom, #F5F5F5, transparent)" }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[1]"
        style={{ height: "200px", background: "linear-gradient(to top, #16131f, transparent)" }}
      />

      <div className="relative z-10">
        <h2 className="mx-auto mb-5 max-w-3xl text-5xl font-medium leading-tight text-white md:text-6xl"
          style={{ letterSpacing: "-0.04em" }}>
          Your XRP already knows what to do.
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-white/60 md:text-lg">
          One payment sets the plan and the exit that unwinds it. Every contract above is live on
          Coston2 &mdash; compose an order and watch it run.
        </p>

        <div className="flex items-center justify-center gap-6">
          <Link
            href="/demo"
            className="inline-flex items-center gap-3 rounded-full bg-white pl-8 pr-2 py-2 text-base font-medium text-black transition-colors duration-200 hover:bg-white/90"
          >
            Try the demo
            <span className="rounded-full bg-black p-2">
              <ArrowRight className="h-5 w-5 text-white" />
            </span>
          </Link>
          <a
            href="https://github.com/Zireaelst/Flare-Hackaton"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-3.5 text-base font-medium text-white transition-colors duration-200 hover:bg-white/10"
          >
            Read the code
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-32 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-sm text-white/40">
            Tempo &mdash; built for Flare Summer Signal. Coston2 testnet.
          </p>
          <div className="flex items-center gap-6">
            {FOOTER_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-white/40 transition-colors duration-200 hover:text-white/70"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CtaFooter;
